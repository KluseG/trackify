import { AnalyticsEvent } from '../../interfaces/analytics-event'
import { AbstractEvent } from '../abstract.event'
import { LoginConfig } from '../../interfaces/events/config'

export class LoginEvent extends AbstractEvent implements AnalyticsEvent<LoginConfig> {
  name = 'login'

  constructor (protected config: LoginConfig) {
    super(config)
  }

  getData (): LoginConfig {
    return {
      method: this.config.method,
      firstname: this.config.firstname,
      lastname: this.config.lastname,
      email: this.config.email,
      id: this.config.id,
      shop_id: this.config.shop_id,
      user_id: this.config.user_id,
      client_id: this.config.client_id,
      ...(this.config.eventId ? { eventId: this.config.eventId} : {}),
      isPremium: this.config.isPremium
    }
  }
}
