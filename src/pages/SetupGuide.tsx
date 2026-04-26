import { Globe, Database, Key, HardDrive, CheckCircle2, ExternalLink } from 'lucide-react';

const steps = [
  {
    icon: Database,
    title: '1. Create a Supabase Project',
    description: 'Go to supabase.com, sign up for free, and create a new project.',
    link: 'https://supabase.com',
    linkText: 'Open Supabase',
  },
  {
    icon: Key,
    title: '2. Copy Your API Keys',
    description:
      'In your Supabase project, go to Settings > API. Copy the Project URL and the anon/public key.',
    code: `VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGci...your-key-here`,
  },
  {
    icon: CheckCircle2,
    title: '3. Update Your .env File',
    description:
      'Open the .env file in your project root and replace the placeholder values with your actual Supabase URL and anon key.',
  },
  {
    icon: HardDrive,
    title: '4. Run the SQL Migration',
    description:
      'In Supabase, go to SQL Editor and paste the contents of supabase/migrations/001_initial_schema.sql. Click Run.',
  },
  {
    icon: HardDrive,
    title: '5. Create Storage Bucket',
    description:
      'In Supabase, go to Storage and create a new private bucket called "vault-files". Then open Storage Settings and set the Global file size limit plus the bucket file size limit high enough for the largest file you want to accept.',
  },
  {
    icon: HardDrive,
    title: '6. Enable Large Uploads',
    description:
      'Free Supabase projects top out at a 50 MB global file size limit. For files above 1 GB, upgrade the Supabase plan, raise both file size limits, and then increase each user quota from Admin -> Users inside the app.',
  },
];

export function SetupGuide() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-600 mb-5">
            <Globe className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">TheWeb</h1>
          <p className="text-gray-400 text-lg">Your personal file hub is almost ready</p>
          <div className="mt-4 inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-2 rounded-lg text-sm">
            Supabase is not configured yet. Follow the steps below to get started.
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <step.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.description}</p>

                  {step.code && (
                    <pre className="mt-3 bg-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto font-mono">
                      {step.code}
                    </pre>
                  )}

                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      {step.linkText}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            After updating your .env file, restart the dev server with{' '}
            <code className="bg-gray-800 px-2 py-0.5 rounded text-gray-300 text-xs">
              npm run dev
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
