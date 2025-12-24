import crypto from 'crypto';
import { AliExpressOAuth } from './oauth';

interface AliExpressConfig {
  appKey: string;
  appSecret: string;
  apiUrl: string;
}

interface ApiParams {
  [key: string]: string | number | boolean;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Product data types from AliExpress API
export interface AliExpressProductData {
  ae_item_base_info_dto?: {
    product_id: number;
    category_id: number;
    subject: string; // Title
    currency_code: string;
    product_status_type: string;
    ws_display: string;
    detail: string; // HTML description
    mobile_detail: string;
  };
  ae_item_sku_info_dtos?: {
    ae_item_sku_info_d_t_o: Array<{
      sku_id: number;
      sku_price: string;
      sku_stock: boolean;
      sku_available_stock: number;
      offer_sale_price: string;
      offer_bulk_sale_price: string;
      sku_attr: string;
      id: string;
    }>;
  };
  ae_multimedia_info_dto?: {
    ae_video_dtos?: {
      ae_video_d_t_o: Array<{
        poster_url: string;
        media_url: string;
      }>;
    };
    image_urls: string; // Semicolon-separated
  };
  ae_store_info?: {
    store_id: number;
    store_name: string;
    store_url: string;
  };
  package_info_dto?: {
    package_height: number;
    package_length: number;
    package_width: number;
    gross_weight: string;
    package_type: boolean;
    base_unit: number;
    product_unit: number;
  };
}

export interface AliExpressProductResponse {
  aliexpress_ds_product_get_response?: {
    result?: {
      ae_item_base_info_dto?: AliExpressProductData['ae_item_base_info_dto'];
      ae_item_sku_info_dtos?: AliExpressProductData['ae_item_sku_info_dtos'];
      ae_multimedia_info_dto?: AliExpressProductData['ae_multimedia_info_dto'];
      ae_store_info?: AliExpressProductData['ae_store_info'];
      package_info_dto?: AliExpressProductData['package_info_dto'];
    };
    rsp_code?: number;
    rsp_msg?: string;
  };
}

/**
 * AliExpress Open Platform API Client
 * Handles authentication, signing, and API calls for dropshipping operations
 */
export class AliExpressClient {
  private config: AliExpressConfig;
  private oauth: AliExpressOAuth;

  constructor() {
    this.config = {
      appKey: process.env.ALIEXPRESS_APP_KEY || '',
      appSecret: process.env.ALIEXPRESS_APP_SECRET || '',
      apiUrl: process.env.ALIEXPRESS_API_URL || 'https://api-sg.aliexpress.com/sync',
    };

    if (!this.config.appKey || !this.config.appSecret) {
      throw new Error('AliExpress API credentials not configured. Check your .env file.');
    }

    this.oauth = new AliExpressOAuth();
  }

  /**
   * Get OAuth handler for authorization
   */
  getOAuth(): AliExpressOAuth {
    return this.oauth;
  }

  /**
   * Generate MD5 signature for API request
   * AliExpress requires params sorted alphabetically, concatenated with secret
   */
  private generateSignature(params: ApiParams): string {
    // Sort parameters alphabetically
    const sortedKeys = Object.keys(params).sort();

    // Build string: secret + key1value1key2value2... + secret
    let signString = this.config.appSecret;
    for (const key of sortedKeys) {
      signString += key + String(params[key]);
    }
    signString += this.config.appSecret;

    // Generate MD5 hash in uppercase
    return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
  }

  /**
   * Make API request to AliExpress Open Platform
   * @param method - API method name
   * @param params - Additional parameters
   * @param requiresAuth - Whether this API requires OAuth access token
   */
  async request<T = unknown>(
    method: string,
    params: ApiParams = {},
    requiresAuth = false
  ): Promise<ApiResponse<T>> {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // System parameters required by AliExpress
    const systemParams: ApiParams = {
      app_key: this.config.appKey,
      method: method,
      timestamp: timestamp,
      sign_method: 'md5',
      v: '2.0',
      format: 'json',
      ...params,
    };

    // Add access token for authenticated requests
    if (requiresAuth) {
      try {
        const accessToken = await this.oauth.getValidAccessToken();
        systemParams.access_token = accessToken;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Authorization required',
          code: 'AUTH_REQUIRED',
        };
      }
    }

    // Generate signature
    const sign = this.generateSignature(systemParams);
    systemParams.sign = sign;

    // Build URL with query params
    const queryString = Object.entries(systemParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    const url = `${this.config.apiUrl}?${queryString}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const data = await response.json();

      // Check for AliExpress error response
      if (data.error_response) {
        return {
          success: false,
          error: data.error_response.msg || 'Unknown error',
          code: data.error_response.code,
        };
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  // ============ DROPSHIPPING API METHODS (require OAuth) ============

  /**
   * Get product details by AliExpress product ID
   * @param productId - AliExpress product ID
   * @param country - Ship to country code (default: EE for Estonia)
   * @param currency - Target currency (default: EUR)
   * @param language - Target language (default: EN)
   */
  async getProduct(productId: string, country = 'EE', currency = 'EUR', language = 'EN') {
    return this.request<AliExpressProductResponse>('aliexpress.ds.product.get', {
      product_id: productId,
      ship_to_country: country,
      target_currency: currency,
      target_language: language,
    }, true); // Requires auth
  }

  /**
   * Search for products (if you have product search permission)
   */
  async searchProducts(keywords: string, pageNo = 1, pageSize = 20) {
    return this.request('aliexpress.ds.product.search', {
      keywords,
      page_no: pageNo,
      page_size: pageSize,
    }, true); // Requires auth
  }

  /**
   * Get shipping/freight info for a product
   */
  async getShippingInfo(productId: string, country: string, quantity = 1) {
    return this.request('aliexpress.logistics.buyer.freight.get', {
      product_id: productId,
      country_code: country,
      quantity: quantity,
    }, true); // Requires auth
  }

  /**
   * Create a dropship order
   */
  async createOrder(orderData: {
    productId: string;
    quantity: number;
    shippingAddress: {
      name: string;
      phone: string;
      address: string;
      city: string;
      province: string;
      country: string;
      zipCode: string;
    };
    logistics: string;
  }) {
    return this.request('aliexpress.ds.order.create', {
      product_id: orderData.productId,
      quantity: orderData.quantity,
      logistics_address: JSON.stringify(orderData.shippingAddress),
      shipping_method: orderData.logistics,
    }, true); // Requires auth
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string) {
    return this.request('aliexpress.ds.order.get', {
      order_id: orderId,
    }, true); // Requires auth
  }

  /**
   * Get tracking information for an order
   */
  async getTracking(orderId: string) {
    return this.request('aliexpress.logistics.ds.trackinginfo.query', {
      order_id: orderId,
    }, true); // Requires auth
  }

  // ============ UTILITY METHODS ============

  /**
   * Extract stock quantity from product data
   */
  getStockFromProductData(productData: AliExpressProductResponse): number {
    const result = productData.aliexpress_ds_product_get_response?.result;
    if (!result?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o) return 0;

    // Sum up all available stock across SKUs
    return result.ae_item_sku_info_dtos.ae_item_sku_info_d_t_o.reduce((total, sku) => {
      return total + (sku.sku_available_stock || 0);
    }, 0);
  }

  /**
   * Extract price from product data (lowest price)
   */
  getPriceFromProductData(productData: AliExpressProductResponse): { price: number; salePrice: number | null } {
    const result = productData.aliexpress_ds_product_get_response?.result;
    if (!result?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o) {
      return { price: 0, salePrice: null };
    }

    const skus = result.ae_item_sku_info_dtos.ae_item_sku_info_d_t_o;
    const prices = skus.map(sku => parseFloat(sku.sku_price || '0')).filter(p => p > 0);
    const salePrices = skus.map(sku => parseFloat(sku.offer_sale_price || '0')).filter(p => p > 0);

    return {
      price: prices.length > 0 ? Math.min(...prices) : 0,
      salePrice: salePrices.length > 0 ? Math.min(...salePrices) : null,
    };
  }

  /**
   * Extract images from product data
   */
  getImagesFromProductData(productData: AliExpressProductResponse): string[] {
    const result = productData.aliexpress_ds_product_get_response?.result;
    const imageUrls = result?.ae_multimedia_info_dto?.image_urls;
    if (!imageUrls) return [];

    return imageUrls.split(';').filter(url => url.length > 0);
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    // Use a simple API call to test credentials
    const result = await this.request('aliexpress.ds.category.get', {
      category_id: 0, // Root category
    });

    if (result.success) {
      return { success: true, message: 'API connection successful!' };
    } else {
      return {
        success: false,
        message: `API connection failed: ${result.error} (code: ${result.code})`
      };
    }
  }
}

export default AliExpressClient;
