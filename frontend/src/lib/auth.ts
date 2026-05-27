const TOKEN_KEY = "tierce_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}


export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Mirror to cookie so Next.js middleware can check auth server-side
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export function logout(): void {
  clearToken();
  window.location.href = "/login";
}
