import { createApiClient } from '@syncpost/api-client';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

export const api = createApiClient(API_URL);
