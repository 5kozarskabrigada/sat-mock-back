#!/usr/bin/env node

/**
 * Smoke test: Register → Login → Protected endpoint
 */

const BASE_URL = 'http://localhost:3001/api';

async function test() {
	try {
		const testEmail = `test-${Date.now()}@example.com`;

		// Step 1: Register new user
		console.log('\n=== Step 1: Register ===');
		const registerRes = await fetch(`${BASE_URL}/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: testEmail,
				password: 'Test@1234',
				role: 'teacher',
			}),
		});
		console.log(`REGISTER_STATUS ${registerRes.status}`);
		if (!registerRes.ok) {
			const errBody = await registerRes.json();
			console.log(`REGISTER_ERROR`, errBody);
			return;
		}

		const registerBody = await registerRes.json();
		const registerToken = registerBody.access_token;
		console.log(`REGISTER_TOKEN: ${!!registerToken}`);

		// Step 2: Login with same credentials
		console.log('\n=== Step 2: Login ===');
		const actualLoginRes = await fetch(`${BASE_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: testEmail,
				password: 'Test@1234',
			}),
		});
		console.log(`LOGIN_STATUS ${actualLoginRes.status}`);
		if (!actualLoginRes.ok) {
			const errBody = await actualLoginRes.json();
			console.log(`LOGIN_ERROR`, errBody);
			return;
		}
		const loginBody = await actualLoginRes.json();
		const authToken = loginBody.access_token;

		console.log(`TOKEN_FROM_LOGIN: ${!!authToken}`);
		if (!authToken) {
			console.log('No token received from login');
			return;
		}

		// Step 3: Call protected endpoint
		console.log('\n=== Step 3: Protected Endpoint (/users/me) ===');
		const meRes = await fetch(`${BASE_URL}/users/me`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
		});
		console.log(`ME_STATUS ${meRes.status}`);
		const meBody = await meRes.json();
		console.log(`ME_BODY`, meBody);
		console.log(`ME_EMAIL ${meBody.email || ''}`);
		console.log(`ME_ROLE ${meBody.role || ''}`);

		if (meRes.ok) {
			console.log('\n✅ SMOKE TEST PASSED - Protected endpoint accessible with valid token');
		} else {
			console.log('\n❌ SMOKE TEST FAILED - Protected endpoint rejected valid token');
		}
	} catch (err) {
		console.error('Test error:', err);
	}
}

test();
