import LegalPage from '../components/LegalPage';
import { PRIVACY } from '../lib/legal';

export default function Privacy() {
  return <LegalPage title="Privacy notice" sections={PRIVACY} other={{ label: 'Read the Conditions of Sale', href: '/terms' }} />;
}
