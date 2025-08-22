import { createClient } from '@supabase/supabase-js';

interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

interface BoardStructure {
  boardId: string;
  columns: Map<string, string>; // column name -> column ID
  lastUpdated: number;
}

export class MondayBoardMapper {
  private static instance: MondayBoardMapper;
  private boardStructures: Map<string, BoardStructure> = new Map();
  private supabase;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

  private constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  static getInstance(): MondayBoardMapper {
    if (!MondayBoardMapper.instance) {
      MondayBoardMapper.instance = new MondayBoardMapper();
    }
    return MondayBoardMapper.instance;
  }

  async getColumnId(boardId: string, columnName: string): Promise<string | null> {
    const structure = await this.getBoardStructure(boardId);
    return structure.columns.get(columnName) || null;
  }

  async getColumnIds(boardId: string, columnNames: string[]): Promise<Map<string, string>> {
    const structure = await this.getBoardStructure(boardId);
    const result = new Map<string, string>();
    
    for (const name of columnNames) {
      const id = structure.columns.get(name);
      if (id) {
        result.set(name, id);
      }
    }
    
    return result;
  }

  private async getBoardStructure(boardId: string): Promise<BoardStructure> {
    const existing = this.boardStructures.get(boardId);
    const now = Date.now();
    
    if (existing && (now - existing.lastUpdated) < this.CACHE_DURATION) {
      return existing;
    }

    // Try to load from Supabase storage first
    const cachedStructure = await this.loadFromSupabase(boardId);
    if (cachedStructure && (now - cachedStructure.lastUpdated) < this.CACHE_DURATION) {
      this.boardStructures.set(boardId, cachedStructure);
      return cachedStructure;
    }

    // Fetch fresh from Monday.com API
    const structure = await this.fetchBoardStructure(boardId);
    await this.saveToSupabase(boardId, structure);
    this.boardStructures.set(boardId, structure);
    return structure;
  }

  private async loadFromSupabase(boardId: string): Promise<BoardStructure | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from('monday-cache')
        .download(`board-${boardId}.json`);

      if (error || !data) {
        return null;
      }

      const jsonText = await data.text();
      const parsed = JSON.parse(jsonText);
      
      // Convert back to Map
      const columns = new Map<string, string>();
      for (const [key, value] of Object.entries(parsed.columns)) {
        columns.set(key, value as string);
      }

      return {
        boardId: parsed.boardId,
        columns,
        lastUpdated: parsed.lastUpdated
      };
    } catch (error) {
      console.warn('Failed to load board structure from Supabase:', error);
      return null;
    }
  }

  private async saveToSupabase(boardId: string, structure: BoardStructure): Promise<void> {
    try {
      // Convert Map to plain object for JSON serialization
      const columnsObj = Object.fromEntries(structure.columns);
      const dataToStore = {
        boardId: structure.boardId,
        columns: columnsObj,
        lastUpdated: structure.lastUpdated
      };

      const { error } = await this.supabase.storage
        .from('monday-cache')
        .upload(`board-${boardId}.json`, JSON.stringify(dataToStore), {
          upsert: true,
          contentType: 'application/json'
        });

      if (error) {
        console.warn('Failed to save board structure to Supabase:', error);
      }
    } catch (error) {
      console.warn('Failed to save board structure to Supabase:', error);
    }
  }

  private async fetchBoardStructure(boardId: string): Promise<BoardStructure> {
    const apiToken = process.env.MONDAY_API_TOKEN;
    if (!apiToken) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }

    const query = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch board structure: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Monday.com API error: ${data.errors[0].message}`);
    }

    const columns = data.data.boards[0]?.columns || [];
    const columnMap = new Map<string, string>();
    
    for (const column of columns) {
      columnMap.set(column.title, column.id);
    }

    return {
      boardId,
      columns: columnMap,
      lastUpdated: Date.now()
    };
  }

  // Utility method to clear cache (useful for testing or force refresh)
  clearCache(boardId?: string): void {
    if (boardId) {
      this.boardStructures.delete(boardId);
    } else {
      this.boardStructures.clear();
    }
  }

  // Debug method to see current column mappings
  getColumnMappings(boardId: string): Map<string, string> | undefined {
    const structure = this.boardStructures.get(boardId);
    return structure?.columns;
  }
}
