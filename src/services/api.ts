import axios from "axios";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api";
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 60000; // Default to 60 seconds
const CREDENTIALS =
  (import.meta.env.VITE_API_CREDENTIALS as string | undefined) || "omit";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT,
  withCredentials: CREDENTIALS === "include",
});

// Default JSON headers for requests
api.defaults.headers.post["Content-Type"] = "application/json";
api.defaults.headers.put["Content-Type"] = "application/json";

export default api;
