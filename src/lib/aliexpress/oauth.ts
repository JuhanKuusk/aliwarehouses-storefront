import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  refresh_expires_at: number;
  user_id?: string;
}

const TOKEN_FILE = path.join(process.cwd(), '.tokens.json');

/**
 * AliExpress OAuth 2.0 Handler
 * Manages authorization flow and token refresh
 */
export class AliExpressOAuth {
  private appKey: string;
  private appSecret: string;
  private callbackUrl: string;
  private baseUrl = 'https://api-sg.aliexpress.com';
  private authUrl = 'https://api-sg.aliexpress.com/oauth/authorize';

  constructor() {
    this.appKey = process.env.ALIEXPRESS_APP_KEY || '';
    this.appSecret = process.env.ALIEXPRESS_APP_SECRET || '';
    this.callbackUrl = process.env.ALIEXPRESS_CALLBACK_URL ||
      'https://aliwarehouses.eu/api/auth/callback';

    if (!this.appKey || !this.appSecret) {
      throw new Error('AliExpress credentials not configured');
    }
  }

  /**
   * Generate the authorization URL - user visits this to authorize
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      client_id: this.appKey,
      redirect_uri: this.callbackUrl,
    });

    if (state) {
      params.append('state', state);
    }

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Generate HMAC-SHA256 signature for IOP protocol
   * Used for /auth/* endpoints
   */
  private generateIOPSignature(params: Record<string, string>, signingPath: string): string {
    const sortedKeys = Object.keys(params).sort();
    let signString = signingPath;
    for (const key of sortedKeys) {
      signString += key + params[key];
    }
    return crypto.createHmac('sha256', this.appSecret).update(signString).digest('hex').toUpperCase();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenData> {
    const timestamp = Date.now().toString();
    const signingPath = '/auth/token/create';

    const params: Record<string, string> = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      code: code,
    };

    params.sign = this.generateIOPSignature(params, signingPath);

    const formBody = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(`${this.baseUrl}/rest${signingPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: formBody,
    });

    const data = await response.json();

    if (data.error_response || (data.code && data.code !== '0')) {
      throw new Error(`OAuth error: ${data.message || data.error_response?.msg} (${data.code})`);
    }

    const tokenData: TokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expire_time || (Date.now() + (data.expires_in || 2592000) * 1000),
      refresh_expires_at: data.refresh_token_valid_time || (Date.now() + (data.refresh_expires_in || 5184000) * 1000),
      user_id: data.user_id || data.seller_id,
    };

    // Save tokens to file
    this.saveTokens(tokenData);

    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken?: string): Promise<TokenData> {
    const currentTokens = this.loadTokens();
    const tokenToUse = refreshToken || currentTokens?.refresh_token;

    if (!tokenToUse) {
      throw new Error('No refresh token available. Re-authorization required.');
    }

    const timestamp = Date.now().toString();
    const signingPath = '/auth/token/refresh';

    const params: Record<string, string> = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      refresh_token: tokenToUse,
    };

    params.sign = this.generateIOPSignature(params, signingPath);

    const formBody = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(`${this.baseUrl}/rest${signingPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: formBody,
    });

    const data = await response.json();

    if (data.error_response || (data.code && data.code !== '0')) {
      throw new Error(`Token refresh error: ${data.message || data.error_response?.msg}`);
    }

    const tokenData: TokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expire_time || (Date.now() + (data.expires_in || 2592000) * 1000),
      refresh_expires_at: data.refresh_token_valid_time || (Date.now() + (data.refresh_expires_in || 5184000) * 1000),
      user_id: data.user_id || data.seller_id,
    };

    this.saveTokens(tokenData);
    return tokenData;
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = this.loadTokens();

    if (!tokens) {
      throw new Error('No tokens found. Authorization required.');
    }

    // Check if access token is still valid (with 5 min buffer)
    if (tokens.expires_at > Date.now() + 300000) {
      return tokens.access_token;
    }

    // Check if refresh token is still valid
    if (tokens.refresh_expires_at > Date.now()) {
      console.log('🔄 Access token expired, refreshing...');
      const newTokens = await this.refreshAccessToken();
      return newTokens.access_token;
    }

    throw new Error('All tokens expired. Re-authorization required.');
  }

  /**
   * Save tokens to file
   */
  private saveTokens(tokens: TokenData): void {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log('💾 Tokens saved to .tokens.json');
  }

  /**
   * Load tokens from file
   */
  loadTokens(): TokenData | null {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
    return null;
  }

  /**
   * Check if authorized
   */
  isAuthorized(): boolean {
    const tokens = this.loadTokens();
    return tokens !== null && tokens.refresh_expires_at > Date.now();
  }

  /**
   * Get token status
   */
  getStatus(): { authorized: boolean; accessTokenValid: boolean; refreshTokenValid: boolean; expiresIn?: string } {
    const tokens = this.loadTokens();

    if (!tokens) {
      return { authorized: false, accessTokenValid: false, refreshTokenValid: false };
    }

    const now = Date.now();
    const accessValid = tokens.expires_at > now;
    const refreshValid = tokens.refresh_expires_at > now;

    let expiresIn: string | undefined;
    if (accessValid) {
      const mins = Math.floor((tokens.expires_at - now) / 60000);
      expiresIn = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    }

    return {
      authorized: refreshValid,
      accessTokenValid: accessValid,
      refreshTokenValid: refreshValid,
      expiresIn,
    };
  }
}

export default AliExpressOAuth;
