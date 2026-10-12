import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { expect, userEvent, within } from "storybook/test";
import { LoginPage } from "./login.js";
import { SignupPage } from "./signup.js";
import { VerifyEmailPage } from "./verify-email.js";

// Las pantallas de acceso (F10.8.4, Auth Flow.html) en cada estado. Los que
// en la app solo se ven con la API respondiendo algo (credenciales malas,
// demasiados intentos) se arman con `parameters.api` (.storybook/mock-api.ts)
// y un `play` que llena y envía el formulario.

/**
 * El router, con el state que deja quien manda aquí (ProtectedLayout, el
 * registro). Cada historia lo pone en `parameters.ruta`: un decorator por
 * historia se apilaría sobre el de `meta` y quedarían dos routers.
 */
const enRuta: Decorator = (Story, { parameters }) => {
  const ruta = (parameters.ruta ?? {}) as { path?: string; state?: unknown };
  return (
    <MemoryRouter initialEntries={[{ pathname: ruta.path ?? "/login", state: ruta.state }]}>
      <Story />
    </MemoryRouter>
  );
};

/**
 * Cada copia de la pantalla: "Lado a lado" pinta la historia dos veces (claro
 * y oscuro), y el `play` tiene que llevar las dos al mismo estado.
 */
function copias(canvasElement: HTMLElement) {
  const mains = [...canvasElement.querySelectorAll("main")];
  return (mains.length > 0 ? mains : [canvasElement]).map((el) => within(el));
}

async function entrar(canvasElement: HTMLElement) {
  for (const canvas of copias(canvasElement)) {
    await userEvent.type(canvas.getByLabelText("Correo"), "dev@presencia.local");
    await userEvent.type(canvas.getByLabelText("Contraseña"), "una-contraseña");
    await userEvent.click(canvas.getByRole("button", { name: "Iniciar sesión" }));
  }
}

async function enviar(canvasElement: HTMLElement, boton: string) {
  for (const canvas of copias(canvasElement)) {
    await userEvent.click(canvas.getByRole("button", { name: boton }));
  }
}

const meta = {
  title: "Acceso/Iniciar sesión",
  component: LoginPage,
  parameters: { layout: "fullscreen" },
  decorators: [enRuta],
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vacio: Story = { name: "Vacío" };

/** Enviar sin llenar: cada campo dice qué falta. */
export const CamposVacios: Story = {
  name: "Campos vacíos",
  play: async ({ canvasElement }) => {
    await enviar(canvasElement, "Iniciar sesión");
    await expect(
      (await within(canvasElement).findAllByText("Escribe tu correo para continuar."))[0],
    ).toBeVisible();
  },
};

export const CredencialesIncorrectas: Story = {
  name: "Credenciales incorrectas",
  parameters: {
    api: {
      "/api/auth/sign-in/email": {
        status: 401,
        body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await entrar(canvasElement);
    await expect((await within(canvasElement).findAllByText(/no coinciden/))[0]).toBeVisible();
  },
};

/** El 429 de Better Auth: la cuenta regresiva sale del X-Retry-After. */
export const DemasiadosIntentos: Story = {
  name: "Demasiados intentos",
  parameters: {
    api: {
      "/api/auth/sign-in/email": {
        status: 429,
        body: { message: "Too many requests. Please try again later." },
        headers: { "X-Retry-After": "9" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await entrar(canvasElement);
    await expect(
      (await within(canvasElement).findAllByText("Demasiados intentos"))[0],
    ).toBeVisible();
  },
};

/** ProtectedLayout perdió la sesión que había en la pestaña. */
export const SesionExpirada: Story = {
  name: "Sesión expirada",
  parameters: { ruta: { state: { from: "/calendario", expired: true } } },
};

/** Desde el aviso de "ya tienes cuenta" o el registro: el correo ya viene puesto. */
export const ConCorreo: Story = {
  name: "Con el correo puesto",
  parameters: { ruta: { state: { email: "dev@presencia.local" } } },
};

export const Registro: StoryObj<typeof SignupPage> = {
  name: "Registro · vacío",
  render: () => <SignupPage />,
};

/** El medidor de fuerza mientras se escribe. */
export const RegistroFuerza: StoryObj<typeof SignupPage> = {
  name: "Registro · fuerza de la contraseña",
  render: () => <SignupPage />,
  play: async ({ canvasElement }) => {
    for (const canvas of copias(canvasElement)) {
      await userEvent.type(canvas.getByLabelText("Contraseña"), "merida2026");
    }
    await expect((await within(canvasElement).findAllByText("Aceptable"))[0]).toBeVisible();
  },
};

export const RegistroErrores: StoryObj<typeof SignupPage> = {
  name: "Registro · campos vacíos",
  render: () => <SignupPage />,
  play: async ({ canvasElement }) => {
    await enviar(canvasElement, "Crear cuenta");
    await expect(
      (await within(canvasElement).findAllByText("Cuéntanos cómo te llamas."))[0],
    ).toBeVisible();
  },
};

export const RevisaTuCorreo: StoryObj<typeof VerifyEmailPage> = {
  name: "Revisa tu correo",
  render: () => <VerifyEmailPage />,
  parameters: { ruta: { path: "/verify-email", state: { email: "ana@ejemplo.mx" } } },
};
