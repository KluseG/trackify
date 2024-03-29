import { AnalyticsDriver } from '../interfaces/analytics-driver'
import { AnalyticsEvent, CustomAnalyticsEvent } from '../interfaces/analytics-event'
import { CurrencyCode } from '../interfaces/trackify-globals'
import { isCustomEvent } from '../helpers/fns'
import { v5 as uuidv5 } from 'uuid'
// import * as jose from 'jose'

import {
  AddPaymentInfoConfig,
  AddShippingInfoConfig,
  AddToCartConfig,
  BeginCheckoutConfig,
  LoginConfig,
  PageViewConfig,
  PurchaseConfig,
  RemoveFromCartConfig,
  SignUpConfig,
  SubscribeConfig,
  UserDataConfig,
  ViewCartConfig,
  ViewItemConfig,
  ViewItemListConfig
} from '../interfaces/events/config'

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
  | SubscribeConfig
  | UserDataConfig
  | SignUpConfig;
export type SupportedEvent = AnalyticsEvent<SupportedEventData> | CustomAnalyticsEvent<unknown>;


declare global {
  interface Window {
    SR?: {
      dynamicContent: {
        get: () => string
      },
      event: {
        pageVisit: (payload: Record<string, string>) => Promise<void>,
        trackCustomEvent: (
          eventName: string,
          payload: Record<string, string | number | keyof typeof CurrencyCode | SynItem[] | undefined> | undefined,
          label?: string
        ) => void;
        sendFormData: (
          eventName: string,
          payload: Record<string, string | number | keyof typeof CurrencyCode | SynItem[] | undefined> | undefined,
          mapping?: Record<string, string>
        ) => void;
      },
      client: {
        clearAccessToken: () => void,
        getCurrentClient: () => string,
        getIdentityHash: () => string,
        hashIdentity: (email: string) => string,
        notify: () => void,
        setAccessToken: (token: string) => void,
        setUuid: (uuid: string) => void,
        setUuidAndIdentityHash: (uuid: string, hash: string) => string,
        update: (
          params: Record<string, string>,
          label: string
        ) => void
      }
    }
  }
}

export interface SynItem extends Record<string, unknown> {
  sku: string,
  quantity: string,
  brand: string,
  category: string
}

export default class SyneriseBrowserDriver implements AnalyticsDriver {

  public static SUPPORTED_EVENTS = [
    'page_view',
    'user_data_update',
    'subscribe',
    'unsubscribe',
    'add_payment_info',
    'add_to_cart',
    'purchase',
    'view_cart',
    'view_item',
    'view_item_list',
    'login',
    'sign_up'
  ]

  public static AVAILABILITY_CHECK_TIMEOUT = 250
  public static AVAILABILITY_CHECK_MAX_TIMEOUT = 1500
  public name = 'SyneriseBrowserDriver'
  private salt = 'synerise'

  public async load (): Promise<boolean> {
    try {
      this.reportDebug('[Synerise] Load')
      await this.checkIfLoaded()

      return true
    } catch (e) {
      return false
    }
  }

  protected reportDebug (_error: unknown): void {
    if (window && typeof console !== 'undefined' && console.debug) {
      console.debug(_error)
    }
  }

  public supportsEvent (event: AnalyticsEvent<unknown>): boolean {
    return SyneriseBrowserDriver.SUPPORTED_EVENTS.includes(event.name) || event.name.indexOf('custom.') >= 0
  }

  public async track (event: AnalyticsEvent<unknown>): Promise<void> {
    this.reportDebug('[Synerise] track')
    if (isCustomEvent(event)) {
      return await this.trackCustom(event)
    }

    const data = event.getData()
    this.reportDebug('[Synerise] track ' + event.name)

    switch (event.name) {
      case 'page_view':
        return await this.trackPageView(data as PageViewConfig)
      case 'add_payment_info':
        return await this.trackAddPaymentInfo(data as AddPaymentInfoConfig)
      case 'add_to_cart':
        return await this.trackAddToCart(data as AddToCartConfig)
      case 'purchase':
        return await this.trackPurchase(data as PurchaseConfig)
      case 'subscribe':
        return await this.subscribe(data as SubscribeConfig)
      case 'unsubscribe':
        return await this.unsubscribe(data as SubscribeConfig)
      case 'view_cart':
        return await this.trackViewCart(data as ViewCartConfig)
      case 'view_item':
        return await this.trackViewItem(data as ViewItemConfig)
      case 'view_item_list':
        return await this.trackViewItemList(data as ViewItemListConfig)
      case 'user_data_update':
        return await this.updateUserData(data as UserDataConfig)
      case 'login':
        return await this.trackLogin(data as LoginConfig)
      case 'sign_up':
        return await this.trackSignUp(data as SignUpConfig)
      default:
        throw new TypeError(`Event ${event.name} not supported!`)
    }
  }

  protected async trackPageView (data: PageViewConfig): Promise<void> {
    if (window && window.SR && 'SR' in window && 'event' in window.SR) {
      this.reportDebug('trackPageView')
      window.SR.event.pageVisit({
        uri: '/' + data.pagePath,
        title: data.pageTitle,
        currency: data.currency as string
      }).then(function () {
        if (window && window.SR && 'SR' in window && 'dynamicContent' in window.SR) {
          window.SR.dynamicContent.get();
        }
      })
    }
  }

  protected async trackCustom (event: CustomAnalyticsEvent<unknown>): Promise<void> {
    this.reportDebug(['[Synerise custom track]', event])
    const data = event.forDriver(this.name)
    if (data === null) {
      return
    }

    if (typeof data.event_name !== 'string') {
      throw new TypeError(`Custom event ${event.name} has to provide event name for ${this.name} [forDriver.event_name]`)
    }

    if (data.event_payload && typeof data.event_payload !== 'object') {
      throw new TypeError(`Custom event ${event.name} has to provide event payload for ${this.name} [forDriver.event_payload]`)
    }


    if (data.event_type === 'form') {
      this.reportDebug([
        '[Synerise custom track.form]',
        data.event_name,
        data.event_payload as Record<string, string | number | undefined | keyof typeof CurrencyCode>,
        data.event_mapping
      ])
      return this.sendForm(
        data.event_name,
        data.event_payload as Record<string, string | number | undefined | keyof typeof CurrencyCode>,
        data.event_mapping as Record<string, string>
      )
    }
    this.reportDebug([
      '[Synerise custom track.push]',
      data.event_name,
      data.event_payload as Record<string, string | number | undefined | keyof typeof CurrencyCode>,
      data.label
    ])
    return this.push(
      data.event_name,
      data.event_payload as Record<string, string | number | undefined | keyof typeof CurrencyCode>,
      data.label as string
    )
  }

  protected push (
    eventName: string,
    payload?: Record<string, string | number | keyof typeof CurrencyCode | undefined | SynItem[]>,
    label?: string
  ): void {
    if (window && window.SR && 'SR' in window && 'event' in window.SR && 'trackCustomEvent' in window.SR.event) {
      window.SR.event.trackCustomEvent(eventName, payload, label)
    }
  }

  protected sendForm (
    eventName: string,
    payload?: Record<string, string | number | keyof typeof CurrencyCode | undefined>,
    mapping?: Record<string, string>
  ): void {
    if (window && window.SR && 'SR' in window && 'event' in window.SR && 'sendFormData' in window.SR.event) {
      window.SR.event.sendFormData(eventName, payload, mapping)
    }
  }

  protected checkIfLoaded (timeout = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.SR) {
        resolve()
      } else if (timeout >= SyneriseBrowserDriver.AVAILABILITY_CHECK_MAX_TIMEOUT) {
        reject()
      } else {
        setTimeout(() => {
          this.checkIfLoaded(timeout + SyneriseBrowserDriver.AVAILABILITY_CHECK_TIMEOUT).then(() => resolve())
            .catch(() => reject())
        }, SyneriseBrowserDriver.AVAILABILITY_CHECK_TIMEOUT)
      }
    })
  }

  protected monetaryValue (value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
  }

  private async trackLogin (data: LoginConfig): Promise<void> {
    this.reportDebug(['[Debug login]', data])
    this.sendForm('login', data as Record<string, string>)

    // const identify = this.setUuidAndIdentityHash(data)
    // if (identify) {
    //   this.push('client.identify', data as Record<string, string>, 'Client log in')
    //   console.debug(['[Synerise].client.identify:', data as Record<string, string>])
    // }
  }

  private async updateUserData (data: UserDataConfig): Promise<void> {
    this.push('client.createOrUpdate', data as Record<string, string>, 'Client update data in account')
    console.debug(['[Synerise].client.createOrUpdate:', data as Record<string, string>])
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private setUuidAndIdentityHash (data: UserDataConfig): boolean {
    if (window && window.SR && 'SR' in window && 'event' in window.SR && 'trackCustomEvent' in window.SR.event && data.email) {
      let hash = window.SR.client.getIdentityHash()
      const uuid = uuidv5(data.email + this.salt, uuidv5.URL)
      if (!hash) {
        hash = window.SR.client.hashIdentity(data.email as string)
      }
      const newHash = window.SR.client.hashIdentity(data.email as string)
      // console.debug(['hash:', hash])
      // console.debug(['newHash:', newHash])
      if (hash !== newHash) {
        console.debug(['New UUID and Hash:', uuid, newHash])
        window.SR.client.setUuidAndIdentityHash(newHash, uuid)
        return true
      }
    }
    return false
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private createJWT (data: UserDataConfig): string {
    if (window && window.SR && 'SR' in window && 'event' in window.SR && 'trackCustomEvent' in window.SR.event) {
      let hash = window.SR.client.getIdentityHash()
      const uuid = uuidv5(data.email + this.salt, uuidv5.URL)
      // console.debug(['UUID:', uuid])
      if (!hash) {
        hash = window.SR.client.hashIdentity(data.email as string)
      }
      window.SR.client.setUuidAndIdentityHash(hash, uuid)

      // const privateKey = ''
      // const jwt = await new jose.SignJWT({
      //   uuid: uuid,
      //   email: data.email
      // })
      //   .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      //   .setExpirationTime('24h')
      //   .sign(privateKey)
      // // const jwt = window.SR.client.setAccessToken()
      // console.debug(['[JTW].client.createOrUpdate:', jwt])


      // window.SR.client.update(data as Record<string, string>, 'TEST')
    }
    return ''
  }

  private async trackSignUp (data: SignUpConfig): Promise<void> {
    // this.setUuidAndIdentityHash(data)
    // const jwt = this.createJWT(data)
    this.sendForm('signup', data as Record<string, string>)

    // this.push('client.createOrUpdate', data as Record<string, string>, 'Client create account')
    // console.debug(['[Synerise].client.createOrUpdate:', data as Record<string, string>])
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async trackAddPaymentInfo (_data: AddPaymentInfoConfig): Promise<void> {
    // this.push('event.checkout-data-step')
    // this.push('client.update', {
    //   'First name': data.customer?.firstname,
    //   'Last name': data.customer?.lastname,
    //   email: data.customer?.email,
    //   phone_number: data.customer?.telephone
    // })
  }

  private async unsubscribe (_data: SubscribeConfig): Promise<void> {
    this.sendForm('newsletter-unsubscribe', {
      email: _data.email
    })
  }

  private async subscribe (_data: SubscribeConfig): Promise<void> {
    this.sendForm('newsletter-agreement', {
      email: _data.email,
      list: _data.list,
      smsOffers: _data.allow_sms_marketing,
      emailOffers: _data.allow_marketing,
      allowPolicy: _data.allow_policy,
      newsletterLanguage: _data.language
    })
  }

  protected async trackViewCart (data: ViewCartConfig): Promise<void> {
    this.push('cart.status', {
      currency: data.currency,
      totalQuantity: data.totalQuantity,
      value: this.monetaryValue(data.value),
      products: this.getItems(data)
    })
  }

  protected getItems (data: SupportedEventData): Array<SynItem> {
    const items: SynItem[] = []
    Array.isArray(data.items) ? data.items.map((item) => (
      items.push({
        sku: item.id as string,
        quantity: item.quantity as string,
        brand: item.brand as string,
        category: item.category as string
      })
    )) : []
    return items
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async trackPurchase (_data: PurchaseConfig): Promise<void> {
    //
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async trackAddToCart (_data: AddToCartConfig): Promise<void> {
    //
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async trackViewItem (_data: ViewItemConfig): Promise<void> {
    //
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async trackViewItemList (_data: ViewItemListConfig): Promise<void> {
    //
  }
}
