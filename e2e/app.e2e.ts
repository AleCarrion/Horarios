import { expect, test, type Page } from "@playwright/test";

/** A day near the end of the shown month, far enough from "today" to be editable. */
async function lateDay(page: Page) {
  return page.evaluate(() => {
    const cols = [
      ...document.querySelectorAll<HTMLElement>("[data-colhead]"),
    ].map((e) => e.dataset.colhead!);
    return cols[cols.length - 3];
  });
}

async function open(page: Page) {
  await page.goto("/");
  await page.waitForSelector(".schedule-table");
}

test("el horario carga completo y sin avisos", async ({ page }) => {
  await open(page);
  await expect(page.locator("section[aria-live]")).toContainText(
    "Todas las reglas y coberturas se cumplen",
  );
});

test("un hueco creado a mano se arregla con «Arreglar avisos»", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
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
  await expect(page.locator("section[aria-live]")).toContainText(
    "Todas las reglas y coberturas se cumplen",
  );
});

test("pedir un libre con reajuste enseña una vista previa antes de cambiar nada", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("option", { name: /Libre/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Libre solicitado");
  await page.getByRole("button", { name: /Cancelar/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("copia de seguridad: guardar, perder los datos y restaurar deja todo igual", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "el menú Exportar es de escritorio",
  );
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Libre/ }).click(); // saved on this device
  await page.waitForTimeout(500);
  const before = await page.evaluate(() =>
    JSON.stringify(
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith("horarios:") && k !== "horarios:queue")
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  await page.getByRole("button", { name: /Exportar/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Guardar copia/ }).click(),
  ]);
  const file = await download.path();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".schedule-table");
  await page.getByLabel("Archivo de copia de seguridad").setInputFiles(file);
  await page.getByRole("button", { name: "Sí, restaurar" }).click();
  await page.waitForSelector(".schedule-table");
  const after = await page.evaluate(() =>
    JSON.stringify(
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith("horarios:") && k !== "horarios:queue")
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  expect(after).toBe(before);
});

test("un archivo que no es una copia se rechaza con un mensaje claro", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "el menú Exportar es de escritorio",
  );
  await open(page);
  await page
    .getByLabel("Archivo de copia de seguridad")
    .setInputFiles({
      name: "x.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hola":1}'),
    });
  await expect(page.getByRole("alertdialog")).toContainText(
    "no es una copia de seguridad",
  );
});

test("ausencia imprevista: la vista previa dice a quién avisar", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await open(page);
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(3).click();
  await page.getByRole("option", { name: /Ausencia/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Ausencia imprevista");
  await expect(dialog).toContainText("Hay que avisar a");
  await dialog.getByRole("button", { name: /Aplicar/ }).click();
  await expect(
    page.locator(`[data-row][data-col="${day}"]`).nth(3),
  ).toHaveAttribute("aria-label", /Ausencia/);
});

test("el resumen del mes enseña a todas las personas", async ({ page }) => {
  await open(page);
  await page.getByText("Resumen del mes por persona").click();
  const table = page.getByRole("table", { name: /Turnos, libres/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(10); // header + 9 people
});

test("reglas: los cambios se guardan, se recuerdan y se pueden restablecer", async ({
  page,
}) => {
  await page.goto("/reglas");
  await expect(
    page.getByRole("heading", { name: "Reglas del horario" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Más: Máximo de días libres seguidos" })
    .click();
  await page.locator("input[type=date]").fill("2026-09-08");
  await page.getByLabel("Se repite cada año").uncheck();
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.getByText("8 de septiembre de 2026")).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Máximo de días libres seguidos" })
      .getByRole("status"),
  ).toHaveText("4");
  await expect(page.getByText("8 de septiembre de 2026")).toBeVisible();
  await page
    .getByRole("button", { name: "Volver a las reglas del hotel" })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Máximo de días libres seguidos" })
      .getByRole("status"),
  ).toHaveText("3");
  await expect(page.getByText("Todavía no hay ninguno.")).toBeVisible();
});

test("un mes publicado no se edita por accidente hasta reabrirlo", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
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

test("el historial recoge un cambio y permite volver atrás", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await open(page);
  const day = await lateDay(page);
  const cell = page.locator(`[data-row][data-col="${day}"]`).nth(3);
  await page.waitForTimeout(2000); // the month is first drawn quickly and then re-planned from last month in the background
  const before = await cell.getAttribute("aria-label");
  await cell.click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Ausencia/ }).click();
  await expect(cell).toHaveAttribute("aria-label", /Ausencia/);
  await page
    .getByRole("button", { name: "Historial de cambios" })
    .first()
    .click();
  const panel = page.getByRole("dialog", { name: "Historial de cambios" });
  await expect(panel).toContainText("Edición manual");
  await panel.getByText("Edición manual").click();
  await panel.getByRole("button", { name: /Volver a/ }).click();
  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(cell).toHaveAttribute("aria-label", before!);
});

test("si no cuadra por casillas bloqueadas, propone desbloquearlas y al hacerlo cuadra", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await open(page);
  const day = await lateDay(page);
  const key = await page.evaluate(() => {
    const cells = [
      ...document.querySelectorAll<HTMLElement>("[data-row][data-col]"),
    ];
    const locks: Record<string, Record<string, boolean>> = {};
    for (const c of cells)
      (locks[c.dataset.row!] ??= {})[c.dataset.col!] = true;
    const first = cells[0].dataset.col!;
    const k = `horarios:locks:${Number(first.slice(0, 4))}-${Number(first.slice(5, 7))}`;
    return { k, locks };
  });
  const asked = page.locator(`[data-row][data-col="${day}"]`).nth(3);
  const rowId = await asked.getAttribute("data-row");
  delete key.locks[rowId!][day]; // the asked day itself is free; everything else is locked
  await page.evaluate(
    ({ k, locks }) => localStorage.setItem(k, JSON.stringify(locks)),
    key,
  );
  await page.reload();
  await page.waitForSelector(".schedule-table");
  await page.locator(`[data-row="${rowId}"][data-col="${day}"]`).click();
  await page.getByRole("option", { name: /Libre/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cómo conseguir que cuadre");
  await dialog
    .getByRole("button", { name: "Desbloquear y recalcular" })
    .click();
  await expect(dialog).toContainText("Se puede cuadrar sin problemas");
});

test("sin Supabase no hay pantalla de entrada: /entrar vuelve al horario y /cuenta lo explica", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page.waitForSelector(".schedule-table");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cuenta");
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
  await expect(page.getByText("modo local")).toBeVisible();
});

test("copiar el patrón del mes anterior: vista previa, aplicar y el mes sigue en regla", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await open(page);
  await page.getByRole("button", { name: "Copiar el mes anterior" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Copiar el patrón de");
  await dialog.getByRole("button", { name: /Aplicar/ }).click();
  await expect(page.locator("section[aria-live]")).toContainText(
    "Todas las reglas y coberturas se cumplen",
  );
  await page.getByRole("button", { name: "Deshacer" }).first().click(); // one step back restores the previous month plan
});

test("comparar meses: tabla con lo que cambia de cada persona", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Comparar meses" }).click();
  const panel = page.getByRole("dialog", { name: "Comparar meses" });
  const table = panel.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(10);
  await panel.getByLabel("Comparar con").selectOption({ index: 6 });
  await expect(table).toBeVisible();
  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(panel).toHaveCount(0);
});

test("la ayuda tiene el manual de la jefa y el de los trabajadores", async ({
  page,
}) => {
  await page.goto("/ayuda");
  await expect(
    page.getByRole("heading", { name: "Manual para la jefa" }),
  ).toBeVisible();
  await expect(page.getByText("Peticiones de los trabajadores")).toBeVisible();
  await page.getByRole("button", { name: "Para los trabajadores" }).click();
  await expect(
    page.getByRole("heading", { name: "Manual para los trabajadores" }),
  ).toBeVisible();
  await expect(page.getByText("Crear tu cuenta")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Qué significan las letras" }),
  ).toHaveCount(0); // the legend is a section, not a list
  await expect(
    page.getByRole("region", { name: "Qué significan las letras" }),
  ).toBeVisible();
});

test("la página de equipo lista la plantilla", async ({ page }) => {
  await page.goto("/equipo");
  await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("Marta");
});

test("una dirección que no existe enseña la página 404 con salida", async ({
  page,
}) => {
  await page.goto("/no-existe");
  await expect(page.getByText("Página no encontrada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ir al horario" })).toBeVisible();
});

test.describe("móvil", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("no hay desplazamiento horizontal y la barra inferior navega", async ({
    page,
  }) => {
    await open(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.getByRole("link", { name: "Equipo" }).last().tap();
    await expect(page).toHaveURL(/\/equipo/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });

  test("el menú de una casilla sale centrado en la pantalla", async ({
    page,
  }) => {
    await open(page);
    await page.locator(".schedule-table tbody button").nth(10).tap();
    const box = await page.getByRole("listbox").boundingBox();
    expect(box).not.toBeNull();
    const centre = box!.y + box!.height / 2;
    expect(Math.abs(centre - 422)).toBeLessThan(80);
  });
});

test("turnos y puestos: renombrar un turno, crear uno propio y usarlo en una casilla", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "la cuadrícula completa es de escritorio",
  );
  await page.goto("/turnos");
  await page.waitForSelector("main");
  await page.getByLabel("Nombre del turno Mañana").fill("Madrugada");
  await page.getByLabel("Letra del turno Mañana").fill("ma");
  await page.getByRole("button", { name: "Añadir turno" }).click();
  await page.getByLabel("Nombre del turno X1").fill("Desayunos");
  await page.getByLabel("Letra del turno Desayunos").fill("dz");
  await expect(page.getByRole("status")).toHaveText("Guardado", {
    timeout: 5000,
  });

  await open(page);
  await expect(page.getByLabel("Leyenda")).toContainText("Madrugada");
  await expect(page.getByLabel("Leyenda")).toContainText("Desayunos");
  const day = await lateDay(page);
  await page.locator(`[data-row][data-col="${day}"]`).nth(0).click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("option", { name: /Desayunos/ }).click();
  await expect(page.locator(`[data-row][data-col="${day}"]`).nth(0)).toHaveText(
    "DZ",
  );
  // still there a few seconds later (the background re-plan of the month leaves the hotel's own shift alone)
  await page.waitForTimeout(2500);
  await expect(page.locator(`[data-row][data-col="${day}"]`).nth(0)).toHaveText(
    "DZ",
  );
});

test("turnos y puestos: un puesto propio aparece como sección del equipo", async ({
  page,
}) => {
  await page.goto("/turnos");
  await page.waitForSelector("main");
  await page.getByRole("button", { name: "Añadir puesto" }).click();
  await page.getByLabel("Nombre del puesto p-1").fill("Conserjes");
  await expect(page.getByRole("status")).toHaveText("Guardado", {
    timeout: 5000,
  });
  await page.goto("/equipo");
  await page.waitForSelector("main");
  await expect(page.getByRole("region", { name: "Conserjes" })).toBeVisible();
});

test("exportar: Excel, PDF del mes y PDF por persona se descargan como archivos de verdad", async ({
  page,
  viewport,
}) => {
  test.skip(
    (viewport?.width ?? 1280) < 640,
    "el menú Exportar es de escritorio",
  );
  await open(page);
  const grab = async (item: RegExp) => {
    await page.getByRole("button", { name: /Exportar/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: item }).click(),
    ]);
    const head = (await import("node:fs"))
      .readFileSync((await download.path())!)
      .subarray(0, 4)
      .toString("latin1");
    return { name: download.suggestedFilename(), head };
  };
  const xlsx = await grab(/Excel \(\.xlsx\)/);
  expect(xlsx.name).toMatch(/^horario-\d{4}-\d{2}\.xlsx$/);
  expect(xlsx.head).toBe("PK\u0003\u0004"); // a zip, as every .xlsx
  const pdf = await grab(/PDF del mes/);
  expect(pdf.name).toMatch(/^horario-\d{4}-\d{2}\.pdf$/);
  expect(pdf.head).toBe("%PDF");
  const people = await grab(/PDF por persona/);
  expect(people.name).toMatch(/por-persona\.pdf$/);
  expect(people.head).toBe("%PDF");
});

test.describe("móvil (exportar)", () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });
  test("el PDF del mes sale desde el menú de acciones", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Más acciones" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /PDF del mes/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
