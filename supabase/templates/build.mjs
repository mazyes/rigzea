// Builds the Supabase Auth email templates from the shared Rigzea layout (api/_email.js).
// Run from the repo root:  node supabase/templates/build.mjs
// Then paste each file into Supabase → Authentication → Emails → the matching template.
// {{ .ConfirmationURL }} is filled in by Supabase when the email is sent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEmail } from '../../api/_email.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = '{{ .ConfirmationURL }}';

const templates = {
  // Subject: დაადასტურე ელფოსტა · Rigzea
  'confirm-signup.html': {
    preheader: 'ერთი დაჭერა და შენი ანგარიში მზადაა.',
    title: 'დაადასტურე ელფოსტა',
    lines: ['მადლობა, რომ Rigzea-ში დარეგისტრირდი. დააჭირე ღილაკს, რომ ელფოსტა დაადასტურო და სამუშაო სივრცე გახსნა.'],
    button: { label: 'ელფოსტის დადასტურება', url },
    note: '14 დღე ყველა ფუნქცია ღიაა და ბარათი არ გჭირდება.',
  },
  // Subject: პაროლის აღდგენა · Rigzea
  'reset-password.html': {
    preheader: 'ბმული ახალი პაროლის დასაყენებლად.',
    title: 'პაროლის აღდგენა',
    lines: ['მივიღეთ მოთხოვნა შენი Rigzea ანგარიშის პაროლის აღდგენაზე. დააჭირე ღილაკს და დააყენე ახალი პაროლი.'],
    button: { label: 'ახალი პაროლის დაყენება', url },
    note: 'თუ პაროლის აღდგენა შენ არ მოგითხოვია, პაროლი იგივე რჩება.',
  },
};

for (const [file, content] of Object.entries(templates)) {
  fs.writeFileSync(path.join(here, file), renderEmail(content));
  console.log('wrote', file);
}
