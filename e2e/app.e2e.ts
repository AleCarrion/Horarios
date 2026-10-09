import { expect, test, type Page } from "@playwright/test";

/** A day near the end of the shown month, far enough from "today" to be editable. */
async function lateDay(page: Page) {
  return page.evaluate(() => {
    const cols = [...document.querySelectorAll<HTMLElement>("[data-colhead]")].map((e) => e.dataset.colhead!);
    return cols[cols.length - 3];
  });
}

async function open(page: Page) {
  await page.goto("/");
  await page.waitForSelector(".schedule-table");
}

test("el horario carga completo y sin avisos", async ({ page }) => {
  await open(page);
  await expect(page.locator("section[aria-live]")).toContainText("Todas las reglas y coberturas se cumplen");
});

test("un hueco creado a mano se arregla con «Arreglar avisos»", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "la cuadrícula completa es de escritorio");
  await open(page);
  const day = await lateDay(page);
  // a receptionist (row 3) takes the day off without readjusting: that leaves a hole
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Libre/ }).click();
  await expect(page.locator("section[aria-live]")).toContainText("aviso");
  await page.getByRole("button", { name: /Arreglar avisos/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /Aplicar/ }).click();
  await expect(page.locator("section[aria-live]")).toContainText("Todas las reglas y coberturas se cumplen");
});

test("pedir un libre con reajuste enseña una vista previa antes de cambiar nada", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "la cuadrícula completa es de escritorio");
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("option", { name: /Libre/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Libre solicitado");
  await page.getByRole("button", { name: /Cancelar/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("copia de seguridad: guardar, perder los datos y restaurar deja todo igual", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "el menú Exportar es de escritorio");
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Libre/ }).click(); // saved on this device
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith("horarios:") && k !== "horarios:queue").sort(([a], [b]) => a.localeCompare(b))));
  await page.getByRole("button", { name: /Exportar/ }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Guardar copia/ }).click()]);
  const file = await download.path();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".schedule-table");
  await page.getByLabel("Archivo de copia de seguridad").setInputFiles(file);
  await page.getByRole("button", { name: "Sí, restaurar" }).click();
  await page.waitForSelector(".schedule-table");
  const after = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith("horarios:") && k !== "horarios:queue").sort(([a], [b]) => a.localeCompare(b))));
  expect(after).toBe(before);
});

test("un archivo que no es una copia se rechaza con un mensaje claro", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "el menú Exportar es de escritorio");
  await open(page);
  await page.getByLabel("Archivo de copia de seguridad").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"hola\":1}") });
  await expect(page.getByRole("alertdialog")).toContainText("no es una copia de seguridad");
});

test("ausencia imprevista: la vista previa dice a quién avisar", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "la cuadrícula completa es de escritorio");
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("option", { name: /Ausencia/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Ausencia imprevista");
  await expect(dialog).toContainText("Hay que avisar a");
  await dialog.getByRole("button", { name: /Aplicar/ }).click();
  await expect(page.locator(`[data-row][data-col="${day}"]`).nth(3)).toHaveAttribute("aria-label", /Ausencia/);
});

test("el resumen del mes enseña a todas las personas", async ({ page }) => {
  await open(page);
  await page.getByText("Resumen del mes por persona").click();
  const table = page.getByRole("table", { name: /Turnos, libres/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(10); // header + 9 people
});

test("reglas: los cambios se guardan, se recuerdan y se pueden restablecer", async ({ page }) => {
  await page.goto("/reglas");
  await expect(page.getByRole("heading", { name: "Reglas del horario" })).toBeVisible();
  await page.getByRole("button", { name: "Más: Máximo de días libres seguidos" }).click();
  await page.locator("input[type=date]").fill("2026-09-08");
  await page.getByLabel("Se repite cada año").uncheck();
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.getByText("8 de septiembre de 2026")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Máximo de días libres seguidos" }).getByRole("status")).toHaveText("4");
  await expect(page.getByText("8 de septiembre de 2026")).toBeVisible();
  await page.getByRole("button", { name: "Volver a las reglas del hotel" }).click();
  await expect(page.getByRole("group", { name: "Máximo de días libres seguidos" }).getByRole("status")).toHaveText("3");
  await expect(page.getByText("Todavía no hay ninguno.")).toBeVisible();
});

test("un mes publicado no se edita por accidente hasta reabrirlo", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "la cuadrícula completa es de escritorio");
  await open(page);
  const day = await lateDay(page);
  const cell = page.locator(`[data-row][data-col="${day}"]`).nth(3);
  await page.getByRole("button", { name: "Publicar mes" }).click();
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
  await expect(cell).toBeDisabled();
  await page.getByRole("button", { name: "Reabrir para editar" }).click();
  await cell.click();
  await expect(page.getByRole("listbox")).toBeVisible();
});

test("el historial recoge un cambio y permite volver atrás", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1280) < 640, "la cuadrícula completa es de escritorio");
  await open(page);
  const day = await lateDay(page);
  const cell = page.locator(`[data-row][data-col="${day}"]`).nth(3);
  const before = await cell.getAttribute("aria-label");
  await cell.click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Ausencia/ }).click();
  await expect(cell).toHaveAttribute("aria-label", /Ausencia/);
  await page.getByRole("button", { name: "Historial de cambios" }).first().click();
  const panel = page.getByRole("dialog", { name: "Historial de cambios" });
  await expect(panel).toContainText("Edición manual");
  await panel.getByText("Edición manual").click();
  await panel.getByRole("button", { name: /Volver a/ }).click();
  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(cell).toHaveAttribute("aria-label", before!);
});

test("la página de equipo lista la plantilla", async ({ page }) => {
  await page.goto("/equipo");
  await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("Marta");
});

test("una dirección que no existe enseña la página 404 con salida", async ({ page }) => {
  await page.goto("/no-existe");
  await expect(page.getByText("Página no encontrada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ir al horario" })).toBeVisible();
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("no hay desplazamiento horizontal y la barra inferior navega", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("link", { name: "Equipo" }).last().tap();
    await expect(page).toHaveURL(/\/equipo/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("el menú de una casilla sale centrado en la pantalla", async ({ page }) => {
    await open(page);
    await page.locator(".schedule-table tbody button").nth(10).tap();
    const box = await page.getByRole("listbox").boundingBox();
    expect(box).not.toBeNull();
    const centre = box!.y + box!.height / 2;
    expect(Math.abs(centre - 422)).toBeLessThan(80);
  });
});
