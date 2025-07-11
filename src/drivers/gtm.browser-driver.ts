import { AnalyticsDriver, AnalyticsDriverConfig } from '../interfaces/analytics-driver'
import { AnalyticsEvent, CustomAnalyticsEvent } from '../interfaces/analytics-event'
import {
  AddPaymentInfoConfig,
  AddShippingInfoConfig,
  AddToCartConfig,
  BeginCheckoutConfig, CustomerConfig,
  LoginConfig,
  PageViewConfig,
  PurchaseConfig,
  RemoveFromCartConfig, SignUpConfig,
  ViewCartConfig,
  ViewItemConfig,
  ViewItemListConfig
} from '../interfaces/events/config'
import { CurrencyCode } from '../interfaces/trackify-globals'
import { isCustomEvent } from '../helpers/fns'
import { Item } from "../interfaces/events/item";

declare global {
  interface Window {
    dataLayer: Array<{ event?: string, ecommerce: Record<string, unknown> | null }>;

    [p: string]: unknown | Array<unknown>,
  }
}

export interface GTMItem extends Record<string, unknown> {
  item_id: string,
  item_name: string,
  affiliation: string | undefined,
  coupon: string | undefined,
  currency: string | undefined,
  discount: number | undefined,
  index: number | undefined,
  item_brand: string | undefined,
  item_category: string | undefined,
  item_category2: string | undefined,
  item_category3: string | undefined,
  item_category4: string | undefined,
  item_category5: string | undefined,
  item_list_id: string | number | undefined,
  item_list_name: string | undefined,
  item_variant: string | undefined,
  location_id: string | number | undefined,
  price: number | undefined,
  quantity: number | undefined
}

export type SupportedEventData =
  PageViewConfig
  | AddPaymentInfoConfig
  | AddShippingInfoConfig
  | AddToCartConfig
  | BeginCheckoutConfig
  | PurchaseConfig
  | RemoveFromCartConfig
  | ViewCartConfig
  | ViewItemConfig
  | ViewItemListConfig
  | LoginConfig
  | SignUpConfig;
export type SupportedEvent = AnalyticsEvent<SupportedEventData> | CustomAnalyticsEvent<unknown>;

export default class GTMBrowserDriver implements AnalyticsDriver {
  public static SUPPORTED_EVENTS = [
    'page_view',
    'add_payment_info',
    'add_shipping_info',
    'add_to_cart',
    'begin_checkout',
    'purchase',
    'pre_purchase',
    'typ_purchase',
    'remove_from_cart',
    'view_cart',
    'view_item',
    'view_item_list',
    'login',
    'sign_up'
  ]
  public name = 'GTMBrowserDriver'
  protected layerId = 'dataLayer'

  constructor (config: AnalyticsDriverConfig) {
    if (config && config.layerId) {
      this.layerId = config.layerId as string
    }
  }

  public async load (): Promise<boolean> {
    window[this.layerId] = window[this.layerId] || []

    return Object.prototype.hasOwnProperty.call(window, this.layerId)
  }

  public supportsEvent (event: AnalyticsEvent<unknown>): boolean {
    return GTMBrowserDriver.SUPPORTED_EVENTS.includes(event.name) || event.name.indexOf('custom.') >= 0
  }

  public async track (event: SupportedEvent): Promise<void> {
    if (isCustomEvent(event)) {
      return await this.trackCustom(event)
    }

    const data = event.getData()

    switch (event.name) {
      case 'page_view':
        if ((data as PageViewConfig).turnOffPageViewForSPA === 1) {
          return
        }
        return await this.trackPageView(data as PageViewConfig)
      case 'add_payment_info':
        return await this.trackAddPaymentInfo(data as AddPaymentInfoConfig)
      case 'add_shipping_info':
        return await this.trackAddShippingInfo(data as AddShippingInfoConfig)
      case 'add_to_cart':
        return await this.trackAddToCart(data as AddToCartConfig)
      case 'begin_checkout':
        return await this.trackBeginCheckout(data as BeginCheckoutConfig)
      case 'purchase':
        return await this.trackPurchase(data as PurchaseConfig)
      case 'pre_purchase':
        return await this.trackPrePurchase(data as PurchaseConfig)
      case 'typ_purchase':
        return await this.trackTypPurchase(data as PurchaseConfig)
      case 'remove_from_cart':
        return await this.trackRemoveFromCart(data as RemoveFromCartConfig)
      case 'view_cart':
        return await this.trackViewCart(data as ViewCartConfig)
      case 'view_item':
        return await this.trackViewItem(data as ViewItemConfig)
      case 'view_item_list':
        return await this.trackViewItemList(data as ViewItemListConfig)
      case 'login':
        return await this.trackLogin(data as LoginConfig)
      case 'sign_up':
        return await this.trackSignUp(data as SignUpConfig)
      default:
        throw new TypeError(`Event ${event.name} not supported!`)
    }
  }

  protected async trackCustom (event: CustomAnalyticsEvent<unknown>): Promise<void> {
    const data = event.forDriver(this.name)
    if (data === null) {
      return
    }

    const ev = {
      type: '',
      name: '',
      payload: {}
    }

    const supportedTypes = ['ecommerce', 'common']
    if (typeof data.event_type !== 'string' || !supportedTypes.includes(data.event_type)) {
      throw new TypeError(`Custom event ${event.name} has to provide event type for ${this.name} [forDriver.event_type]. Supported types: ${supportedTypes.join(
        ', ')}`)
    }

    ev.type = data.event_type

    if (typeof data.event_name !== 'string') {
      throw new TypeError(`Custom event ${event.name} has to provide event name for ${this.name} [forDriver.event_name]`)
    }

    ev.name = data.event_name

    if (data.event_payload === null || typeof data.event_payload !== 'object') {
      throw new TypeError(`Custom event ${event.name} has to provide event payload for ${this.name} [forDriver.event_payload]`)
    }

    ev.payload = data.event_payload as Record<string, unknown>

    switch (ev.type) {
      case 'ecommerce':
        return this.pushEcommerce(ev.name, ev.payload)
      case 'common':
        return this.pushCommon(ev.name, ev.payload)
      default:
        throw new TypeError(`Custom event ${event.name} not supported!`)
    }
  }

  protected async trackPageView (data: PageViewConfig): Promise<void> {
    this.pushCommon(data.customEventName ?? 'page_view', {
      page_path: data.pagePath,
      page_title: data.pageTitle,
      language: data.language,
      currency: data.currency,
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackAddPaymentInfo (data: AddPaymentInfoConfig): Promise<void> {
    this.pushEcommerce('add_payment_info', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      coupon: data.coupon,
      payment_type: data.paymentMethod,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackAddShippingInfo (data: AddShippingInfoConfig): Promise<void> {
    this.pushEcommerce('add_shipping_info', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      coupon: data.coupon,
      shipping_tier: data.shippingTier,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackAddToCart (data: AddToCartConfig): Promise<void> {
    this.pushEcommerce('add_to_cart', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackBeginCheckout (data: BeginCheckoutConfig): Promise<void> {
    this.pushEcommerce('begin_checkout', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      coupon: data.coupon,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackPurchase (data: PurchaseConfig): Promise<void> {
    this.pushEcommerce('purchase', {
      currency: data.currency,
      transaction_id: data.transactionId,
      value: this.monetaryValue(data.value),
      affiliation: data.affiliation,
      coupon: data.coupon,
      shipping: data.shipping ? this.monetaryValue(data.shipping) : undefined,
      tax: data.tax ? this.monetaryValue(data.tax) : undefined,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
    if (data.customer) {
      this.pushCustomer(data.customer as CustomerConfig)
    }
  }

  protected async trackPrePurchase (data: PurchaseConfig): Promise<void> {
    this.pushEcommerce('pre-purchase', {
      currency: data.currency,
      transaction_id: data.transactionId,
      value: this.monetaryValue(data.value),
      affiliation: data.affiliation,
      coupon: data.coupon,
      shipping: data.shipping ? this.monetaryValue(data.shipping) : undefined,
      tax: data.tax ? this.monetaryValue(data.tax) : undefined,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackTypPurchase (data: PurchaseConfig): Promise<void> {
    this.pushEcommerce('typ-purchase', {
      currency: data.currency,
      transaction_id: data.transactionId,
      value: this.monetaryValue(data.value),
      affiliation: data.affiliation,
      coupon: data.coupon,
      shipping: data.shipping ? this.monetaryValue(data.shipping) : undefined,
      tax: data.tax ? this.monetaryValue(data.tax) : undefined,
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackRemoveFromCart (data: RemoveFromCartConfig): Promise<void> {
    this.pushEcommerce('remove_from_cart', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackViewCart (data: ViewCartConfig): Promise<void> {
    this.pushEcommerce('view_cart', {
      currency: data.currency,
      totalQuantity: data.totalQuantity,
      value: this.monetaryValue(data.value),
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackViewItem (data: ViewItemConfig): Promise<void> {
    this.pushEcommerce('view_item', {
      currency: data.currency,
      value: this.monetaryValue(data.value),
      items: this.getItems(data),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected async trackViewItemList (data: ViewItemListConfig): Promise<void> {
    this.pushEcommerce('view_item_list', {
      item_list_id: data.listId,
      item_list_name: data.listName,
      items: this.getItems(data, {
        item_list_name: data.listName,
        item_list_id: data.listId
      }),
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }

  protected getItems (data: SupportedEventData, defaults: Partial<GTMItem> = {}): Array<GTMItem> {
    let indexAdjuster = 0
    if (Array.isArray(data.items) &&
      data.items[0] &&
      typeof data.items[0].index !== 'undefined' &&
      data.items[0].index !== null &&
      data.items[0].index === 0) {
      indexAdjuster = 1
    }

    const items = Array.isArray(data.items) ? data.items.map((item: Record<string, string | number | undefined> | Item, iteration: number) => ({
      item_id: item.id,
      item_name: item.name,
      affiliation: item.affiliation,
      coupon: item.coupon,
      currency: item.currency,
      discount: item.discount ? this.monetaryValue(item.discount as number) : undefined,
      index: typeof item.index === 'undefined' ? iteration + 1 : (item.index as number) + indexAdjuster,
      item_brand: item.brand,
      item_category: item.category,
      item_category2: item.category2,
      item_category3: item.category3,
      item_category4: item.category4,
      item_category5: item.category5,
      item_list_id: item.listId,
      item_list_name: item.listName,
      item_variant: item.variant,
      location_id: item.locationId,
      price: item.price ? this.monetaryValue(item.price as number) : undefined,
      quantity: item.quantity
    })) : []

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return items.map((item: GTMItem) => {
      for (const key in defaults) {
        if (typeof item[key] === 'undefined' || item[key] === null) {
          item[key] = defaults[key]
        }
      }

      return item
    })
  }

  protected pushEcommerce (
    eventName: string,
    payload: Record<string, string | number | keyof typeof CurrencyCode | Array<GTMItem> | undefined>
  ): void {
    (window[this.layerId] as Array<unknown>).push({ ecommerce: null });
    (window[this.layerId] as Array<unknown>).push({
      event: eventName,
      ecommerce: payload
    })
  }

  protected pushCommon (
    eventName: string,
    payload: Record<string, string | number | keyof typeof CurrencyCode | undefined>
  ): void {
    (window[this.layerId] as Array<unknown>).push({
      event: eventName,
      ...payload
    })
  }

  protected pushCustomer (
    payload: CustomerConfig
  ): void {
    (window[this.layerId] as Array<unknown>).push({
      'customer': {
        'em': payload.email,     // Lowercase customer email
        'fn': payload.firstname,                   // Lowercase customer first name
        'ln': payload.lastname,                  // Lowercase customer last name
        'ph': payload.phone ?? '',            // Customer phone with country code, digits only (+ should be changed into 00,
        // i.e. +48 => 0048)
        'external_id': payload.id ?? '',    // External user identifier in CRM i.e. client identifier (if applicable)
        'ge': payload.gender ?? '',                      // Customer gender (optional)
        'db': payload.birthDate ?? '',               // Birthdate (optional) in YYYYMMDD format
        'ct': payload.city ?? '',              // Lowercase customer city name
        'st': payload.province ?? '',                     // Lowercase customer state (province) name
        'zp': payload.zipCode ?? '',                  // Zip code (numbers only)
        'country': payload.country ?? '',                 // Lowercase, 2-digit country code slug
        'is_premium': payload.isPremium ?? ''             // customer belongs to F&F benefit program
      }
    })
  }

  protected monetaryValue (value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
  }

  private async trackLogin (data: LoginConfig): Promise<void> {
    this.pushCustomer(data)
    this.pushCommon('login', {
      method: data.method,
      user_id: data.user_id || '',
      client_id: data.client_id || data.id || '',
      ...(data.eventId ? { event_id: data.eventId} : {}),
      isPremium: data.isPremium || '',
    })
  }

  private async trackSignUp (data: SignUpConfig): Promise<void> {
    this.pushCustomer(data)
    this.pushCommon('sign_up', {
      method: data.method,
      user_id: data.user_id || '',
      client_id: data.client_id || data.id || '',
      ...(data.eventId ? { event_id: data.eventId} : {}),
    })
  }
}
