import Stripe from 'stripe';
import { getEnv } from '../config.js';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(getEnv().STRIPE_SECRET_KEY);
  }
  return stripe;
}
