export interface ApiResponse<T = any> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaginatedResponse<T = any> {
  status: boolean;
  message: string;
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
} 