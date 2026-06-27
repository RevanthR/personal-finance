import { cache } from "react";
import { auth } from "./auth";

// Deduplicates auth() calls within a single request.
// Both the layout and each page call auth() — this makes the second call free.
export const getSession = cache(auth);
