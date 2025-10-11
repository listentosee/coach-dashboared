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
      // Clear cached board structure to force fresh fetch
      this.boardMapper.clearCache(this.boardId);
      
      // Get column IDs for filtering and data extraction
      const columnIds = await this.boardMapper.getColumnIds(this.boardId, [
        'Email', 'Status', 'First Name', 'Last Name', 
        'School Name', 'Organization', 'Phone', 'Division', 'Region',
        'Live Scan', 'Mandated Reporter'
      ]);
      
      // Debug: Check what we actually got
      console.log('=== COLUMN MAPPING DEBUG ===');
      console.log('Requested columns:', ['Email', 'Status', 'First Name', 'Last Name', 'School Name', 'Phone', 'Division', 'Region', 'Live Scan', 'Mandated Reporter']);
      console.log('Found columns:', Object.fromEntries(columnIds));
      console.log('=== END COLUMN MAPPING DEBUG ===');

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

    const getCheckboxValue = (columnName: string) => {
      const columnId = columnIds.get(columnName);
      if (!columnId) {
        console.log(`Checkbox column "${columnName}" not found in mappings`);
        return false;
      }
      
      const column = columnValues.find((col: any) => col.id === columnId);
      console.log(`Checkbox column "${columnName}" (ID: ${columnId}):`, column);
      
      if (!column) return false;
      
      // For checkbox columns, parse the value to check if checked
      if (column.type === 'checkbox' && column.value) {
        try {
          const parsedValue = JSON.parse(column.value);
          const isChecked = parsedValue.checked === true;
          console.log(`Checkbox value:`, parsedValue, `isChecked: ${isChecked}`);
          return isChecked;
        } catch (e) {
          console.log(`Failed to parse checkbox value:`, e);
          return false;
        }
      }
      
      // Fallback to text field (some checkboxes might use text)
      const isChecked = column.text && column.text.toLowerCase().includes('v');
      console.log(`Fallback checkbox text: "${column.text}" isChecked: ${isChecked}`);
      return isChecked;
    };

    const isApproved = getStatusValue('Status');
    console.log(`Final isApproved result: ${isApproved}`);
    
    const liveScanCompleted = getCheckboxValue('Live Scan');
    const mandatedReporterCompleted = getCheckboxValue('Mandated Reporter');
    
    console.log('=== FINAL PARSED COACH OBJECT ===');
    console.log('Live Scan Completed:', liveScanCompleted);
    console.log('Mandated Reporter Completed:', mandatedReporterCompleted);

    const schoolNameValue = getColumnValue('School Name');
    const organizationValue = getColumnValue('Organization');
    const resolvedSchoolName = schoolNameValue || organizationValue;

    const coachObject = {
      id: item.id,
      email: getColumnValue('Email'),
      fullName: `${getColumnValue('First Name')} ${getColumnValue('Last Name')}`.trim() || item.name,
      firstName: getColumnValue('First Name'),
      lastName: getColumnValue('Last Name'),
      schoolName: resolvedSchoolName,
      mobileNumber: getColumnValue('Phone'),
      division: getColumnValue('Division'),
      region: getColumnValue('Region'),
      isApproved: isApproved,
      liveScanCompleted: liveScanCompleted,
      mandatedReporterCompleted: mandatedReporterCompleted
    };

    console.log('School Name Column:', schoolNameValue);
    console.log('Organization Column:', organizationValue);
    console.log('Complete coach object:', JSON.stringify(coachObject, null, 2));
    console.log('=== END FINAL PARSED COACH OBJECT ===');
    
    return coachObject;
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

  // Method to update coach status to "Synced to Dashboard"
  async updateCoachStatus(mondayCoachId: string, statusIndex: string): Promise<boolean> {
    try {
      // Get the Status column ID
      const columnIds = await this.boardMapper.getColumnIds(this.boardId, ['Status']);
      const statusColumnId = columnIds.get('Status');

      if (!statusColumnId) {
        console.error('Status column not found in Monday.com board');
        return false;
      }

      // GraphQL mutation to update the status
      // Note: For status columns, pass the index number (e.g., "9" for "Synced To Dashboard")
      const query = `
        mutation {
          change_simple_column_value(
            board_id: ${this.boardId},
            item_id: ${mondayCoachId},
            column_id: "${statusColumnId}",
            value: "${statusIndex}"
          ) {
            id
          }
        }
      `;

      console.log('Updating Monday.com status:', {
        boardId: this.boardId,
        itemId: mondayCoachId,
        statusIndex: statusIndex,
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
        console.error(`Monday.com API error: ${response.status}`);
        return false;
      }

      const data = await response.json();

      if (data.errors) {
        console.error('Monday.com GraphQL errors:', data.errors);
        return false;
      }

      console.log('Successfully updated Monday.com status:', data);
      return true;
    } catch (error) {
      console.error('Error updating Monday.com status:', error);
      return false;
    }
  }
}
