const SUBSCRIPTION_PLANS = Object.freeze({
  free: Object.freeze({
    name: "Free",
    price: 0,
    applicationLimit: 1,
  }),
  bronze: Object.freeze({
    name: "Bronze",
    price: 10000,
    applicationLimit: 3,
  }),
  silver: Object.freeze({
    name: "Silver",
    price: 30000,
    applicationLimit: 5,
  }),
  gold: Object.freeze({
    name: "Gold",
    price: 100000,
    applicationLimit: null,
  }),
});

const getSubscriptionPlan = (plan) =>
  Object.hasOwn(SUBSCRIPTION_PLANS, plan) ? SUBSCRIPTION_PLANS[plan] : null;

module.exports = {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlan,
};
