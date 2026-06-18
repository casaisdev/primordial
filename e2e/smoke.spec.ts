import { test, expect } from '@playwright/test'

// End-to-end smoke coverage for the layers Vitest can't reach: the App Router
// pages, client hydration, and the worker-backed simulation shell. These assert
// the app boots and its primary surfaces work — not simulation correctness,
// which the deterministic sim suites own.

test.describe('simulation shell', () => {
  test('boots into an idle, startable simulation', async ({ page }) => {
    await page.goto('/')

    // Wordmark and the canvas viewport (an ARIA application region) render.
    await expect(page.getByText('primordial', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('application')).toBeVisible()

    // The sim starts idle with a START control.
    const primary = page.getByRole('button', { name: 'START simulation' })
    await expect(primary).toBeVisible()
    await expect(page.getByText('IDLE').first()).toBeVisible()
  })

  test('starting the sim transitions it to running', async ({ page }) => {
    await page.goto('/')

    // The worker assigns a seed when it signals "ready"; until then the header
    // SEED reads "-". Wait for that so our START click can't race the ready
    // message (which would otherwise reset the sim straight back to idle).
    await expect(page.locator('header')).not.toContainText('SEED-')

    await page.getByRole('button', { name: 'START simulation' }).click()

    // The control's label (and accessible name) flips to PAUSE and the status
    // reads RUNNING. Reaching this state also confirms the worker spun up
    // without a fatal error tearing the shell down.
    await expect(page.getByRole('button', { name: 'PAUSE simulation' })).toBeVisible()
    await expect(page.getByText('RUNNING').first()).toBeVisible()
  })

  test('exposes the allow-extinction toggle the docs reference', async ({ page }) => {
    await page.goto('/')

    // The LAB panel is collapsed by default; open it to reach the toggle.
    await page.getByRole('button', { name: /LAB PARAMETERS/ }).click()

    const toggle = page.getByRole('switch', { name: 'Allow extinction' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('mobile viewport notice', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('shows a dismissible desktop-recommended notice that stays dismissed', async ({ page }) => {
    await page.goto('/')

    const notice = page.getByRole('status', { name: 'Display notice' })
    await expect(notice).toBeVisible()

    await notice.getByRole('button', { name: /Continue anyway/ }).click()
    await expect(notice).toBeHidden()

    // The choice persists — a reload doesn't bring it back.
    await page.reload()
    await expect(page.getByRole('status', { name: 'Display notice' })).toHaveCount(0)
  })
})

test.describe('content pages', () => {
  test('navigates from the sim to docs and about', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'DOCS' }).click()
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.getByRole('heading', { name: 'How to read the simulation' })).toBeVisible()

    await page.goto('/')
    await page.getByRole('link', { name: 'ABOUT' }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible()
  })

  test('docs and about cross-link back to the sim', async ({ page }) => {
    await page.goto('/docs')
    await page.getByRole('link', { name: /back to sim/ }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/about')
    await page.getByRole('link', { name: /back to sim/ }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})
