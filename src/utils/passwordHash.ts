export async function hashPassword(password: string, saltString?: string): Promise<string> {
  const salt = saltString || crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  
  let hashBuffer = await crypto.subtle.digest('SHA-256', data);
  for (let i = 0; i < 10000; i++) {
    hashBuffer = await crypto.subtle.digest('SHA-256', hashBuffer);
  }
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt] = storedHash.split(':');
  const passwordHash = await hashPassword(password, salt);
  return passwordHash === storedHash;
}
