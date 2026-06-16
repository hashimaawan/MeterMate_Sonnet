import {
  Client,
  Environment,
  ProductFamiliesController,
  ProductsController,
  ComponentsController,
  SubscriptionsController,
  SubscriptionComponentsController,
  SubscriptionProductsController,
  SubscriptionStatusController,
  InvoicesController,
  InsightsController,
  EventsController,
  CustomersController,
} from '@maxio-com/advanced-billing-sdk';
import { config } from './config';

const environment =
  config.maxio.environment === 'EU' ? Environment.EU : Environment.US;

const maxioClient = new Client({
  basicAuthCredentials: {
    username: config.maxio.apiKey,
    password: 'x',
  },
  environment,
  site: config.maxio.siteSubdomain,
  timeout: 30000,
});

export const productFamiliesController = new ProductFamiliesController(maxioClient);
export const productsController = new ProductsController(maxioClient);
export const componentsController = new ComponentsController(maxioClient);
export const subscriptionsController = new SubscriptionsController(maxioClient);
export const subscriptionComponentsController = new SubscriptionComponentsController(maxioClient);
export const subscriptionProductsController = new SubscriptionProductsController(maxioClient);
export const subscriptionStatusController = new SubscriptionStatusController(maxioClient);
export const invoicesController = new InvoicesController(maxioClient);
export const insightsController = new InsightsController(maxioClient);
export const eventsController = new EventsController(maxioClient);
export const customersController = new CustomersController(maxioClient);

export { maxioClient };
