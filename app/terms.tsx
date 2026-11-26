import LegalPage from '../components/LegalPage';
import { TERMS } from '../lib/legal';

export default function Terms() {
  return <LegalPage title="Conditions of Sale and Bidder Terms" sections={TERMS} other={{ label: 'Read the Privacy notice', href: '/privacy' }} />;
}
