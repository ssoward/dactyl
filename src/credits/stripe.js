import Stripe from 'stripe';
import { env } from '../env.js';
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const BUNDLES = {
    starter: { priceUsd: 10_00, credits: 110, label: 'Starter (110 credits)' },
    growth: { priceUsd: 50_00, credits: 600, label: 'Growth (600 credits)' },
    pro: { priceUsd: 200_00, credits: 2600, label: 'Pro (2600 credits)' },
    volume: { priceUsd: 500_00, credits: 7000, label: 'Volume (7000 credits)' },
};
/**
 * Create a Stripe Checkout Session for a credit bundle purchase.
 * Returns the hosted checkout URL and session ID.
 */
export async function createTopupSession(agentId, bundle) {
    const b = BUNDLES[bundle];
    if (!b) {
        throw new Error(`Unknown bundle: ${bundle}`);
    }
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'usd',
                    unit_amount: b.priceUsd,
                    product_data: {
                        name: b.label,
                        description: `${b.credits} Dactyl marketplace credits`,
                    },
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        metadata: {
            agent_id: agentId,
            bundle,
            credits: String(b.credits),
        },
        success_url: `${env.BASE_URL}/credits/topup/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.BASE_URL}/credits/topup/cancel`,
    });
    return {
        url: session.url ?? '',
        sessionId: session.id,
    };
}
/** Get the credit amount associated with a bundle key. */
export function getBundleCredits(bundle) {
    return BUNDLES[bundle]?.credits ?? 0;
}
//# sourceMappingURL=stripe.js.map