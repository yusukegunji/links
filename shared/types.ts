export interface Link {
  id: number;
  url: string;
  title: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LinkInput {
  url: string;
  title?: string;
  note?: string;
  tags?: string[];
}

export interface TagCount {
  name: string;
  count: number;
}

export interface Suggestion {
  title: string;
  tags: string[];
}
