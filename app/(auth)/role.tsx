import { Redirect } from 'expo-router';

// Public sign-up is for bidders only, so there is nothing to choose.
// Links that still point here go straight to the registration form.
export default function ChooseRole() {
  return <Redirect href="/(auth)/register" />;
}
