import { test, expect } from '@playwright/test';

// Helper function to initialize isolated mock database state per test
async function setupMocks(page: any, initialUsers: any[]) {
  let users = [...initialUsers];

  // Forward console messages and page errors for diagnostic visibility
  page.on('console', (msg: any) => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err: any) => console.log(`BROWSER RUNTIME ERROR: ${err.message}\nStack:\n${err.stack}`));

  // Expose mock database REST and Auth handler to browser context
  await page.exposeFunction('mockApiHandler', async (method: string, url: string, bodyText: string | null) => {
    if (url.includes('/app_users')) {
      if (method === 'GET') {
        return { status: 200, bodyText: JSON.stringify(users) };
      } else if (method === 'POST') {
        const body = JSON.parse(bodyText || '{}');
        const newUser = {
          id: body.id || `user-${Date.now()}`,
          name: body.name,
          role: body.role,
          point: body.point,
          pin: body.pin,
          is_active: true
        };
        if (!users.find(u => u.id === newUser.id)) {
          users.push(newUser);
        }
        return { status: 201, bodyText: JSON.stringify(newUser) };
      } else if (method === 'PATCH') {
        const body = JSON.parse(bodyText || '{}');
        const match = url.match(/id=eq\.(.+)/);
        const userId = match ? match[1] : null;
        if (userId) {
          users = users.map(u => {
            if (u.id === userId) {
              if (body.is_active === false) {
                return { ...u, is_active: false };
              }
              return { ...u, ...body };
            }
            return u;
          }).filter(u => u.is_active !== false);
        }
        return { status: 200, bodyText: JSON.stringify({ success: true }) };
      }
    } else if (url.includes('/tenant_points')) {
      return { status: 200, bodyText: JSON.stringify([]) };
    } else if (url.includes('/tenants')) {
      return { status: 200, bodyText: JSON.stringify([{ company_name: 'Mock VkusBuket' }]) };
    } else if (url.includes('/auth/v1/')) {
      return {
        status: 200,
        bodyText: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            aud: 'authenticated',
            role: 'authenticated',
            email: '87777667663@mail.ru',
            app_metadata: {
              provider: 'email',
              providers: ['email'],
              tenant_id: 'mock-tenant-id'
            },
            user_metadata: {},
            identities: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      };
    }
    return { status: 200, bodyText: JSON.stringify([]) };
  });

  // 1. Seed tenant session and override window.fetch on every page navigation
  await page.addInitScript(() => {
    (window as any).capturedRequests = [];
    window.localStorage.setItem('vb_tenant_jwt', 'mock-access-token');
    window.localStorage.setItem('vb_tenant_id', 'mock-tenant-id');
    window.localStorage.setItem('vb_supabase_session', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'mock-user-id',
        email: '87777667663@mail.ru',
        app_metadata: {
          tenant_id: 'mock-tenant-id'
        }
      }
    }));

    const originalFetch = window.fetch;
    window.fetch = async function (input: any, init: any) {
      let urlStr = '';
      let method = 'GET';
      let bodyText = null;

      if (typeof input === 'string') {
        urlStr = input;
        method = (init && init.method) || 'GET';
        bodyText = init && init.body ? String(init.body) : null;
      } else if (input && typeof input === 'object' && 'url' in input) {
        urlStr = input.url;
        method = input.method || (init && init.method) || 'GET';
        if (init && init.body) {
          bodyText = String(init.body);
        } else if (typeof input.clone === 'function') {
          try {
            const cloned = input.clone();
            bodyText = await cloned.text();
          } catch (e) {
            bodyText = null;
          }
        } else if ('body' in input) {
          bodyText = input.body ? String(input.body) : null;
        }
      } else {
        urlStr = String(input);
        method = (init && init.method) || 'GET';
        bodyText = init && init.body ? String(init.body) : null;
      }

      method = method.toUpperCase();

      if (urlStr.includes('/rest/v1/') || urlStr.includes('/auth/v1/')) {
        if (method === 'OPTIONS') {
          return new Response('', {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': window.location.origin,
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Allow-Headers': 'content-type,apikey,x-client-info,authorization',
              'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS'
            }
          });
        }
        (window as any).capturedRequests.push({ method, url: urlStr, bodyText });
        
        try {
          const response = await (window as any).mockApiHandler(method, urlStr, bodyText);
          return new Response(response.bodyText, {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': window.location.origin,
              'Access-Control-Allow-Credentials': 'true'
            }
          });
        } catch (err) {
          console.error('[MockFetchError]', err);
          return new Response(JSON.stringify({ error: 'Mock handler error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      return originalFetch.apply(this, arguments as any);
    };
  });

  // Navigate to establish origin context and seed localStorage directly
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('vb_tenant_jwt', 'mock-access-token');
    window.localStorage.setItem('vb_tenant_id', 'mock-tenant-id');
    window.localStorage.setItem('vb_supabase_session', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'mock-user-id',
        email: '87777667663@mail.ru',
        app_metadata: {
          tenant_id: 'mock-tenant-id'
        }
      }
    }));
  });

  return {
    getUsers: () => users,
    setUsers: (newUsers: any[]) => { users = newUsers; }
  };
}

// Align initial user IDs with standard INIT_USERS IDs from utils.js to prevent duplicates
const getInitialUsers = () => [
  { id: "00000000-0000-4000-a000-000000000001", name: "Владелец", role: "owner", point: null, pin: "" },
  { id: "00000000-0000-4000-a000-000000000002", name: "Директор", role: "director", point: null, pin: "1234" },
  { id: "00000000-0000-4000-a000-000000000003", name: "Юлия Кассир", role: "cashier", point: "Мастерская", pin: "1593" }
];

async function enterPin(page: any, pin: string) {
  for (const digit of pin.split('')) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

// Enters incorrect PIN and synchronously waits for UI to update (handling 200ms React state/timeout transitions)
async function enterIncorrectPin(page: any, pin: string, attemptNum: number) {
  await enterPin(page, pin);
  const remaining = 5 - attemptNum;
  if (remaining > 0) {
    await expect(page.locator(`text=Неверный PIN. Осталось попыток: ${remaining}`)).toBeVisible();
  } else {
    await expect(page.locator('text=Слишком много попыток')).toBeVisible();
  }
}

// Programmatic session helper to log in a user bypassing UI flows (highly robust across viewports)
async function loginUserProgrammatically(page: any, user: any) {
  await page.evaluate((u) => {
    window.localStorage.setItem('vb_session_user', JSON.stringify(u));
    window.localStorage.setItem('vb_session_ts', String(Date.now()));
  }, user);
  await page.goto('/');
  await expect(page.locator('text=Выберите профиль сотрудника')).not.toBeVisible();
}

// Programmatic session helper to log out
async function logoutProgrammatically(page: any) {
  await page.evaluate(() => {
    window.localStorage.removeItem('vb_session_user');
    window.localStorage.removeItem('vb_session_page');
  });
  await page.goto('/');
  await expect(page.locator('text=Выберите профиль сотрудника')).toBeVisible();
}

// Combined programmatic login and navigation to Settings -> Employees tab to prevent multi-navigation lockups in Safari/WebKit
async function loginAndGoToSettings(page: any, user: any) {
  await page.evaluate((u) => {
    window.localStorage.setItem('vb_session_user', JSON.stringify(u));
    window.localStorage.setItem('vb_session_ts', String(Date.now()));
    window.localStorage.setItem('vb_session_page', JSON.stringify('settings'));
  }, user);
  await page.goto('/');

  // Wait for the Settings UI to be attached to DOM (meaning loading is complete)
  const settingsTab = page.locator('button:has-text("Сотрудники")').first();
  await settingsTab.waitFor({ state: 'attached' });

  // If we are on mobile viewport, close the default-open sidebar menu overlay to uncover Settings tab buttons
  const backdrop = page.locator('div[style*="rgba(0,0,0,0.6)"], div[style*="rgba(0, 0, 0, 0.6)"]');
  try {
    // Check if backdrop is currently visible without long timeout
    if (await backdrop.count() > 0 && await backdrop.first().isVisible()) {
      await backdrop.first().click();
    }
  } catch (e) {
    // Ignore errors clicking backdrop
  }

  await page.locator('button:has-text("Сотрудники")').first().click();
}

test.describe('PIN Authentication and Management Suite', () => {

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(90000);
  });

  // TIER 1: FEATURE COVERAGE (HAPPY PATHS)

  test('Tier 1.1: Create Employee with Valid PIN', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    // Click Add Employee
    await page.locator('button:has-text("+ Добавить сотрудника")').click();

    // Fill form details
    await page.getByPlaceholder('Елена').fill('Кассир Тест');
    await page.locator('select').first().selectOption('cashier');
    await page.getByPlaceholder('1234').fill('2468');
    await page.locator('select').nth(1).selectOption('Мастерская');

    await page.getByRole('button', { name: 'Добавить', exact: true }).click();

    // Wait for and verify POST sync payload
    let captured: any = null;
    for (let i = 0; i < 30; i++) {
      captured = await page.evaluate(() => {
        const req = (window as any).capturedRequests.find((r: any) => r.url.includes('/app_users') && r.method === 'POST');
        return req ? { bodyText: req.bodyText } : null;
      });
      if (captured) break;
      await page.waitForTimeout(100);
    }
    expect(captured).not.toBeNull();
    const postData = JSON.parse(captured.bodyText || '{}');

    // Verify sync payload
    expect(postData.name).toBe('Кассир Тест');
    expect(postData.pin).toBe('2468');

    // Verify Toast and layout update
    await expect(page.locator('text=Сотрудник добавлен!')).toBeVisible();
    await expect(page.locator('div', { hasText: 'Кассир Тест' }).first()).toBeVisible();
  });

  test('Tier 1.2 & 1.4: Authenticate with Valid PIN (Autosubmit)', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Select cashier
    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();

    // Enter correct PIN (1593)
    await enterPin(page, '1593');

    // Should login and redirect to POS page immediately without pressing any submit button
    await expect(page.locator('div:has-text("Касса")').first()).toBeVisible({ timeout: 10000 });
  });

  test('Tier 1.3: Update User PIN in Settings', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    // Find "Юлия Кассир", click Edit
    const editButton = page.locator('xpath=//div[div/div/div[text()="Юлия Кассир"]]//button[text()="Изменить"]');
    await editButton.click();

    // Clear PIN and input new PIN relative to the row containing name input
    const row = page.locator('input').filter({ hasValue: 'Юлия Кассир' }).locator('xpath=../..');
    const pinInput = row.locator('input[inputmode="numeric"]');
    await pinInput.fill('');
    await pinInput.fill('7531');

    await row.locator('button:has-text("✓")').click();

    // Wait for and verify PATCH sync payload
    let captured: any = null;
    for (let i = 0; i < 30; i++) {
      captured = await page.evaluate(() => {
        const req = (window as any).capturedRequests.find((r: any) => r.url.includes('/app_users') && r.method === 'PATCH');
        return req ? { bodyText: req.bodyText } : null;
      });
      if (captured) break;
      await page.waitForTimeout(100);
    }
    expect(captured).not.toBeNull();
    const patchData = JSON.parse(captured.bodyText || '{}');

    // Verify sync payload
    expect(patchData.pin).toBe('7531');

    // Verify Toast and view change
    await expect(page.locator('text=Сохранено!')).toBeVisible();
    await expect(page.locator('xpath=//div[div/div/div[text()="Юлия Кассир"]]')).toContainText('PIN: 7531');
  });

  test('Tier 1.5: Login with Empty PIN Bypass', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Clicking "Владелец" should bypass PinScreen and log in immediately
    await page.locator('button', { hasText: 'Владелец' }).first().click();
    
    // Redirected to Dashboard
    await expect(page.locator('div:has-text("Дашборд")').first()).toBeVisible();
  });

  // TIER 2: BOUNDARY & CORNER CASES

  test('Tier 2.1: Reject Under-length (3-digit) PIN during Creation', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    // Add employee
    await page.locator('button:has-text("+ Добавить сотрудника")').click();
    await page.getByPlaceholder('Елена').fill('Пин Короткий');
    await page.getByPlaceholder('1234').fill('123'); // 3 digits only
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();

    // Verify error toast
    await expect(page.locator('text=Введите имя и 4-значный PIN')).toBeVisible();
  });

  test('Tier 2.2: Character limit constraint on PIN inputs (maxLength)', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    await page.locator('button:has-text("+ Добавить сотрудника")').click();
    const pinField = page.getByPlaceholder('1234');

    // HTML validation checks
    await expect(pinField).toHaveAttribute('maxlength', '4');

    // Fill attempt with 5 digits
    await pinField.fill('12345');
    // Verify only 4 digits are accepted
    await expect(pinField).toHaveValue('1234');
  });

  test('Tier 2.3: Rejection of Non-numeric Characters', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    await page.locator('button:has-text("+ Добавить сотрудника")').click();
    const pinField = page.getByPlaceholder('1234');

    // Attempt to type non-numeric characters one-by-one to trigger keypress filtering
    await pinField.pressSequentially('1a2!');
    // Verify non-numeric are rejected by regexp /^\d*$/ in the component
    await expect(pinField).toHaveValue('12');
  });

  test('Tier 2.4: Attempt to Save Under-Length PIN in Edit Mode (Deadlock Check)', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    // Edit user "Юлия Кассир"
    const editButton = page.locator('xpath=//div[div/div/div[text()="Юлия Кассир"]]//button[text()="Изменить"]');
    await editButton.click();

    // Type a 3-digit PIN
    const row = page.locator('input').filter({ hasValue: 'Юлия Кассир' }).locator('xpath=../..');
    const pinInput = row.locator('input[inputmode="numeric"]');
    await pinInput.fill('');
    await pinInput.fill('999');

    // Save
    await row.locator('button:has-text("✓")').click();

    // We assert that the validation blocks this save, displaying toast warning.
    await expect(page.locator('text=Введите имя и 4-значный PIN')).toBeVisible();
    await expect(pinInput).toBeVisible(); // Edit inputs should still be open
  });

  test('Tier 2.5 & 2.6: Brute Force Attempt Counter & Lockout', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Select cashier
    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();

    // Enter incorrect PIN 4 times
    for (let i = 1; i <= 4; i++) {
      await enterIncorrectPin(page, '1111', i);
    }

    // 5th incorrect attempt should lock out the profile
    await enterIncorrectPin(page, '1111', 5);
    
    // Keypad should disappear during lockout
    await expect(page.getByRole('button', { name: '1', exact: true })).not.toBeVisible();
  });

  test('Tier 2.7: Lockout Expiration and Recovery', async ({ page }) => {
    // Install virtual clock before navigation
    await page.clock.install();
    await setupMocks(page, getInitialUsers());

    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();

    // Lockout profile (5 attempts)
    for (let i = 1; i <= 5; i++) {
      await enterIncorrectPin(page, '1111', i);
    }

    // Advance virtual clock by 30 seconds
    await page.clock.fastForward(30000);

    // Lockout should expire, revealing digit buttons again
    await expect(page.locator('text=Слишком много попыток')).not.toBeVisible();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();

    // Enter correct PIN
    await enterPin(page, '1593');
    await expect(page.locator('div:has-text("Касса")').first()).toBeVisible();
  });

  // TIER 3: CROSS-FEATURE COMBINATIONS

  test('Tier 3.1: Persisted Lockout State across Page Reloads', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();

    // Trigger lockout
    for (let i = 1; i <= 5; i++) {
      await enterIncorrectPin(page, '1111', i);
    }

    // Reload page
    await page.goto('/');

    // Select profile again
    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();

    // Should remain locked out
    await expect(page.locator('text=Слишком много попыток')).toBeVisible();
    await expect(page.getByRole('button', { name: '1', exact: true })).not.toBeVisible();
  });

  test('Tier 3.2: Role Separation - Access Controls on PIN Editing', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // Log in as Cashier (Julya Kassir has PIN 1593)
    await page.locator('button', { hasText: 'Юлия Кассир' }).first().click();
    await enterPin(page, '1593');

    // Should be on POS screen
    await expect(page.locator('div:has-text("Касса")').first()).toBeVisible();

    // Assert that Settings menu button is not visible
    const settingsBtn = page.locator('button:has-text("Настройки"), button[title="Настройки"]');
    await expect(settingsBtn).not.toBeVisible();
  });

  // TIER 4: REAL-WORLD SCENARIOS (END-TO-END LIFECYCLE)

  test('Tier 4.1: Full Employee Lifecycle Scenario', async ({ page }) => {
    await setupMocks(page, getInitialUsers());

    // 1 & 2. Log in as Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);

    // 3. Create new employee "Игорь" with PIN "6789"
    await page.locator('button:has-text("+ Добавить сотрудника")').click();
    await page.getByPlaceholder('Елена').fill('Игорь');
    await page.locator('select').first().selectOption('cashier');
    await page.getByPlaceholder('1234').fill('6789');
    await page.locator('select').nth(1).selectOption('Мастерская');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();

    // Verify toast
    await expect(page.locator('text=Сотрудник добавлен!')).toBeVisible();

    // 4. Log out programmatically to return to PinScreen
    await logoutProgrammatically(page);

    // 5. Select "Игорь" and attempt wrong PIN "0000"
    await page.locator('button', { hasText: 'Игорь' }).first().click();
    await enterIncorrectPin(page, '0000', 1);

    // 6. Enter correct PIN "6789" and log in
    await enterPin(page, '6789');
    await expect(page.locator('div:has-text("Касса")').first()).toBeVisible();

    // 7 & 8. Switch user back to Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);
    const igorEditButton = page.locator('xpath=//div[div/div/div[text()="Игорь"]]//button[text()="Изменить"]');
    await igorEditButton.click();
    const igorRow = page.locator('input').filter({ hasValue: 'Игорь' }).locator('xpath=../..');
    const igorPinInput = igorRow.locator('input[inputmode="numeric"]');
    await igorPinInput.fill('');
    await igorPinInput.fill('1234');
    await igorRow.locator('button:has-text("✓")').click();
    await expect(page.locator('text=Сохранено!')).toBeVisible();

    // 9. Log out programmatically
    await logoutProgrammatically(page);

    // 10. Select "Игорь", enter old PIN "6789" (fails), then new PIN "1234" (succeeds)
    await page.locator('button', { hasText: 'Игорь' }).first().click();
    await enterIncorrectPin(page, '6789', 1);
    await enterPin(page, '1234');
    await expect(page.locator('div:has-text("Касса")').first()).toBeVisible();

    // 11. Switch back to Owner and go to settings
    await loginAndGoToSettings(page, getInitialUsers()[0]);
    
    // Find Igor, click edit, click delete
    const igorEditButtonDelete = page.locator('xpath=//div[div/div/div[text()="Игорь"]]//button[text()="Изменить"]');
    await igorEditButtonDelete.click();
    const igorRowDelete = page.locator('input').filter({ hasValue: 'Игорь' }).locator('xpath=../..');
    await igorRowDelete.getByRole('button', { name: '🗑', exact: true }).click();
    await expect(page.locator('text=Сотрудник удален')).toBeVisible();

    // 12. Log out programmatically and verify "Игорь" is gone from the PinScreen list
    await logoutProgrammatically(page);
    await expect(page.locator('button', { hasText: 'Игорь' })).not.toBeVisible();
  });
});
