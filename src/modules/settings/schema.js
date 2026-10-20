import { z } from 'zod';

export const registrationSettingsSchema = z.object({ allowRegistration: z.boolean() }).strict();
