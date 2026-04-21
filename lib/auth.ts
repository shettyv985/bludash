// C:\Users\Varun Shetty\Desktop\New folder\bludash\lib\auth.ts
export const CLIENTS = {
  geojit123: {
    password: "geojit@123",
    name: "Geojit",
    clientKey: "GEOJIT",
  },
  chakolas123: {
    password: "chakolas@123",
    name: "Chakolas",
    clientKey: "CHAKOLAS",
  },
  halwahaweli123: {
    password: "halwahaweli@123",
    name: "Halwa Haweli",
    clientKey: "HALWAHAWELI",
  },
  abad123: {
    password: "abad@123",
    name: "ABAD Builders",
    clientKey: "ABADBuilders",
  },
  blu123: {
    password: "blu@123",
    name: "BLUSTEAK",
    clientKey: "ALL",
  },
};

export type ClientKey = keyof typeof CLIENTS;

export const ALL_CLIENTS = [
  { label: "Geojit", value: "GEOJIT" },
  { label: "Chakolas", value: "CHAKOLAS" },
  { label: "Halwa Haweli", value: "HALWAHAWELI" },
  { label: "ABAD Builders", value: "ABADBuilders" },
];