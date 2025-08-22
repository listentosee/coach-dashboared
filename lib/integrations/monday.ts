import { MondayBoardMapper } from './monday/board-mapper';

interface MondayCoach {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  schoolName: string;
  mobileNumber?: string;
  division?: string;
  region?: string;
  isApproved: boolean;
  liveScanCompleted: boolean;
  mandatedReporterCompleted: boolean;
}

export class MondayClient {
  private apiToken: string;
  private boardId: string;
  private baseUrl = 'https://api.monday.com/v2';
  private boardMapper: MondayBoardMapper;

  constructor() {
    console.log('MondayClient constructor called');
    this.apiToken = process.env.MONDAY_API_TOKEN!;
    this.boardId = process.env.MONDAY_BOARD_ID!;
    this.boardMapper = MondayBoardMapper.getInstance();
    
    console.log('Environment variables:', {
      hasToken: !!this.apiToken,
      hasBoardId: !!this.boardId,
      boardId: this.boardId
    });
    
    if (!this.apiToken) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }
    if (!this.boardId) {
      throw new Error('MONDAY_BOARD_ID environment variable is required');
    }
    
    console.log('MondayClient constructor completed successfully');
  }

  async getCoachByEmail(email: string): Promise<MondayCoach | null> {
    console.log('getCoachByEmail called with email:', email);
    
    try {
      // Get column IDs for filtering and data extraction
      const columnIds = await this.boardMapper.getColumnIds(this.boardId, [
        'Email', 'Status', 'Full Name', 'First Name', 'Last Name', 
        'School Name', 'Mobile Number', 'Division', 'Region',
        'Live Scan Completed', 'Mandated Reporter Completed'
      ]);

      console.log('Column mappings:', Object.fromEntries(columnIds));

      const emailColumnId = columnIds.get('Email');
      if (!emailColumnId) {
        throw new Error('Email column not found in board');
      }

      // GraphQL query to find coach by email with filtering
      const query = `
        query {
          boards(ids: [${this.boardId}]) {
            items_page(query_params: {
              rules: [{
                column_id: "${emailColumnId}",
                compare_value: ["${email}"]
              }]
            }) {
              items {
                id
                name
                column_values {
                  id
                  type
                  value
                  text
                }
              }
            }
          }
        }
      `;

      console.log('Monday.com API Request:', {
        boardId: this.boardId,
        email: email,
        query: query
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.apiToken,
          'Content-Type': 'application/json',
          'API-Version': '2024-01'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Monday.com API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Monday.com API Response:', JSON.stringify(data, null, 2));
      
      // Should only return matching items now
      const items = data.data.boards[0]?.items_page?.items || [];
      console.log(`Found ${items.length} matching items`);
      
      if (items.length === 0) {
        console.log('No coach found with this email');
        return null;
      }

      // Take the first (and should be only) matching item
      const coach = items[0];
      console.log('Found coach item:', JSON.stringify(coach, null, 2));
      
      // Validate the coach has "Completed" status
      const parsedCoach = this.parseCoachData(coach, columnIds);
      if (!parsedCoach.isApproved) {
        console.log('Coach found but status is not "Completed"');
        return null;
      }
      
      console.log('Coach validated with "Completed" status');
      return parsedCoach;
    } catch (error) {
      console.error('Error fetching coach from Monday.com:', error);
      return null;
    }
  }

  private parseCoachData(item: any, columnIds: Map<string, string>): MondayCoach {
    const columnValues = item.column_values;
    
    console.log('Parsing coach data with column IDs:', Object.fromEntries(columnIds));
    
    const getColumnValue = (columnName: string) => {
      const columnId = columnIds.get(columnName);
      if (!columnId) {
        console.log(`Column "${columnName}" not found in mappings`);
        return '';
      }
      
      const column = columnValues.find((col: any) => col.id === columnId);
      console.log(`Column "${columnName}" (ID: ${columnId}):`, column);
      return column?.text || '';
    };

    const getStatusValue = (columnName: string) => {
      const columnId = columnIds.get(columnName);
      if (!columnId) {
        console.log(`Status column "${columnName}" not found in mappings`);
        return false;
      }
      
      const column = columnValues.find((col: any) => col.id === columnId);
      console.log(`Status column "${columnName}" (ID: ${columnId}):`, column);
      
      if (!column) return false;
      
      // For status columns, use the text field directly
      if (column.type === 'status') {
        const hasComplete = column.text && column.text.toLowerCase().includes('complete');
        console.log(`Status text: "${column.text}" hasComplete: ${hasComplete}`);
        return hasComplete;
      }
      
      // For other column types, try to parse value or use text
      if (column.value) {
        try {
          const parsedValue = JSON.parse(column.value);
          const hasComplete = parsedValue.label && parsedValue.label.toLowerCase().includes('complete');
          console.log(`Parsed value:`, parsedValue, `hasComplete: ${hasComplete}`);
          return hasComplete;
        } catch (e) {
          const hasComplete = column.text && column.text.toLowerCase().includes('complete');
          console.log(`Text value: "${column.text}" hasComplete: ${hasComplete}`);
          return hasComplete;
        }
      }
      
      // Fallback to text field
      const hasComplete = column.text && column.text.toLowerCase().includes('complete');
      console.log(`Fallback text: "${column.text}" hasComplete: ${hasComplete}`);
      return hasComplete;
    };

    const isApproved = getStatusValue('Status');
    console.log(`Final isApproved result: ${isApproved}`);

    return {
      id: item.id,
      email: getColumnValue('Email'),
      fullName: getColumnValue('Full Name') || item.name,
      firstName: getColumnValue('First Name'),
      lastName: getColumnValue('Last Name'),
      schoolName: getColumnValue('School Name'),
      mobileNumber: getColumnValue('Mobile Number'),
      division: getColumnValue('Division'),
      region: getColumnValue('Region'),
      isApproved: isApproved,
      liveScanCompleted: getStatusValue('Live Scan Completed'),
      mandatedReporterCompleted: getStatusValue('Mandated Reporter Completed')
    };
  }

  // Method to verify if a coach exists and is approved
  async verifyCoach(email: string): Promise<{ exists: boolean; isApproved: boolean; coach?: MondayCoach }> {
    const coach = await this.getCoachByEmail(email);
    
    if (!coach) {
      return { exists: false, isApproved: false };
    }

    // Coach exists in board, but approval status is determined by the status field
    return {
      exists: true,
      isApproved: coach.isApproved, // This checks if status = "Completed"
      coach
    };
  }
}
