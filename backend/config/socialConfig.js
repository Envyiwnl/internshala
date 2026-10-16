const configuredMutationWindow = Number(
  process.env.POST_MUTATION_WINDOW_MINUTES,
);

const POST_MUTATION_WINDOW_MINUTES =
  Number.isFinite(configuredMutationWindow) && configuredMutationWindow > 0
    ? configuredMutationWindow
    : 30;

const POST_MUTATION_WINDOW_MS = POST_MUTATION_WINDOW_MINUTES * 60 * 1000;

const getPostMutationDeadline = (createdAt) => {
  return new Date(new Date(createdAt).getTime() + POST_MUTATION_WINDOW_MS);
};

module.exports = {
  POST_MUTATION_WINDOW_MINUTES,
  POST_MUTATION_WINDOW_MS,
  getPostMutationDeadline,
};
