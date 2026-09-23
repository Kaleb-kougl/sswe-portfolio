import { z } from 'zod';

import { CORPUS } from '@/data/corpus';

import { defineTool } from './types';

export const getProfile = defineTool({
  name: 'get_profile',
  title: 'Get Kaleb Kougl’s profile',
  description:
    'Who Kaleb Kougl is and how to reach him: name, current title, summary, location, the roles he is targeting, dated availability, email, contact-form URL and profile links (site, LinkedIn, GitHub). ' +
    'Call this first when asked about Kaleb in general, whether he is open to a role, or how to contact him. ' +
    'There is no phone number here on purpose: point people to the email or the contact form. This server cannot send messages.',
  inputSchema: z.object({}),
  handler: () => CORPUS.profile,
});
