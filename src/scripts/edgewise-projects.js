import { config as loadEnv } from 'dotenv';

const EDGEWISE_GRAPHQL_URL = 'https://api.edgewise.io/graphql';

const QUERY = `
  query PublicProjects {
    publicProjects {
      id
      title
      slug
    }
  }
`;

loadEnv({ path: '.env.development' });
loadEnv();

function getToken() {
  return (
    process.env.EDGEWISE_API_TOKEN ||
    process.env.EDGEWISE_TOKEN ||
    process.env.EDGEWISE ||
    ''
  ).trim();
}

async function main() {
  const token = getToken();

  if (!token) {
    console.error(
      'Missing Edgewise token. Set EDGEWISE_API_TOKEN, EDGEWISE_TOKEN, or EDGEWISE in .env.development.'
    );
    process.exitCode = 1;
    return;
  }

  const response = await fetch(EDGEWISE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY }),
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.error('Edgewise returned non-JSON output:');
    console.error(text);
    process.exitCode = 1;
    return;
  }

  if (!response.ok || data?.errors?.length) {
    console.error('Edgewise query failed.');
    console.error(JSON.stringify(data?.errors || data, null, 2));
    process.exitCode = 1;
    return;
  }

  const projects = Array.isArray(data?.data?.publicProjects)
    ? data.data.publicProjects
    : [];

  if (!projects.length) {
    console.log('No publicProjects returned for this token.');
    return;
  }

  for (const project of projects) {
    const id = String(project?.id ?? '').trim();
    const title = String(project?.title ?? '').trim();
    const slug = String(project?.slug ?? '').trim();

    console.log(`${id}\t${title}\t${slug}`);
  }
}

main().catch((error) => {
  console.error('Failed to fetch Edgewise projects:', error);
  process.exitCode = 1;
});
