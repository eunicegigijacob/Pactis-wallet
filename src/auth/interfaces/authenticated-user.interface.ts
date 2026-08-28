export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
}
