export const localUser = {
  id: 'local-owner',
  name: 'Local owner',
  email: 'owner@local.invalid',
  image: null,
};
const session = { data: { user: localUser, session: { id: 'local-session' } }, isPending: false };
export const authClient = { useSession: () => session };
