export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Vercel Git integration environment variables
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
  const deploymentId = process.env.VERCEL_URL || 'localhost';
  const timestamp = Date.now();

  res.status(200).json({ 
    version: commitSha, 
    deploymentId: deploymentId,
    timestamp
  });
}
