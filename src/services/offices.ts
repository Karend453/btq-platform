// src/services/offices.ts

export type Office = {
    id: string;
    name: string;
    state?: string;
  };
  
  const MOCK_OFFICE: Office = {
    id: "office_001",
    name: "Demo Office — Charlotte",
    state: "NC",
  };
  
  export async function getCurrentOffice(): Promise<Office> {
    await new Promise((r) => setTimeout(r, 150));
    return MOCK_OFFICE;
  }