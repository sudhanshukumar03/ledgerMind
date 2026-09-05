const http = require('http');

async function test() {
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'finance@ledgermind.dev', password: 'demo' + '1234' })
  });
  
  if (!loginRes.ok) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    return;
  }
  const loginData = await loginRes.json();
  console.log('Login successful. Data:', loginData);
  const token = loginData.access_token || loginData.token;

  const excRes = await fetch('http://localhost:3001/api/v1/exceptions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Exceptions status:', excRes.status);
  
  const healthRes = await fetch('http://localhost:3001/api/v1/health');
  console.log('Health status:', healthRes.status, await healthRes.text());
}

test().catch(console.error);
