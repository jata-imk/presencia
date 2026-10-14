import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { expect, userEvent, within } from "storybook/test";
import type { RespuestaDeHistoria } from "../../.storybook/mock-api.js";
import { RecuperarPage } from "./recuperar.js";

// Recuperar la contraseña (F10.8.4, Auth Flow.html). Los pasos viven en el
// estado de la pantalla, así que cada historia llega al suyo con un `play`
// que llena el formulario, y la API responde con `parameters.api`.

const conRouter: Decorator = (Story) => (
  <MemoryRouter initialEntries={[{ pathname: "/recuperar", state: { email: "ana@ejemplo.mx" } }]}>
    <Story />
  </MemoryRouter>
);

/** Cada copia de la pantalla: "Lado a lado" pinta la historia dos veces. */
function copias(canvasElement: HTMLElement) {
  const mains = [...canvasElement.querySelectorAll("main")];
  return (mains.length > 0 ? mains : [canvasElement]).map((el) => within(el));
}

const PEDIR: Record<string, RespuestaDeHistoria> = {
  "/api/auth/email-otp/request-password-reset": { body: { success: true } },
};

async function alCodigo(canvasElement: HTMLElement) {
  for (const canvas of copias(canvasElement)) {
    await userEvent.click(canvas.getByRole("button", { name: "Enviar código" }));
  }
  await within(canvasElement).findAllByText("Revisa tu correo");
}

async function escribirCodigo(canvasElement: HTMLElement, codigo = "123456") {
  for (const canvas of copias(canvasElement)) {
    await userEvent.click(canvas.getByLabelText("Dígito 1"));
    await userEvent.keyboard(codigo);
  }
}

async function alaContrasena(canvasElement: HTMLElement) {
  await alCodigo(canvasElement);
  await escribirCodigo(canvasElement);
  await within(canvasElement).findAllByText("Crea tu nueva contraseña");
}

async function cambiar(canvasElement: HTMLElement) {
  await alaContrasena(canvasElement);
  for (const canvas of copias(canvasElement)) {
    await userEvent.type(canvas.getByLabelText("Nueva contraseña"), "Merida-2026");
    await userEvent.type(canvas.getByLabelText("Confirma la contraseña"), "Merida-2026");
    await userEvent.click(canvas.getByRole("button", { name: "Cambiar contraseña" }));
  }
}

const meta = {
  title: "Acceso/Recuperar contraseña",
  component: RecuperarPage,
  parameters: { layout: "fullscreen", api: PEDIR },
  decorators: [conRouter],
} satisfies Meta<typeof RecuperarPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Paso 1, con el correo que traía el login. */
export const Correo: Story = {};

/** Paso 2: el código, con la cuenta regresiva para reenviar. */
export const Codigo: Story = {
  name: "Código",
  play: async ({ canvasElement }) => alCodigo(canvasElement),
};

/** Paso 3: la contraseña nueva con su medidor y la confirmación. */
export const Contrasena: Story = {
  name: "Contraseña nueva",
  play: async ({ canvasElement }) => {
    await alaContrasena(canvasElement);
    for (const canvas of copias(canvasElement)) {
      await userEvent.type(canvas.getByLabelText("Nueva contraseña"), "Merida-2026");
      await userEvent.type(canvas.getByLabelText("Confirma la contraseña"), "Merida-202");
    }
  },
};

/** El código estaba mal: se regresa a su paso con los intentos que quedan. */
export const CodigoIncorrecto: Story = {
  name: "Código incorrecto",
  parameters: {
    api: {
      ...PEDIR,
      "/api/auth/email-otp/reset-password": {
        status: 400,
        body: { code: "INVALID_OTP", message: "Invalid OTP" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await cambiar(canvasElement);
    await expect((await within(canvasElement).findAllByText(/Código incorrecto/))[0]).toBeVisible();
  },
};

export const CodigoExpirado: Story = {
  name: "Código expirado",
  parameters: {
    api: {
      ...PEDIR,
      "/api/auth/email-otp/reset-password": {
        status: 400,
        body: { code: "OTP_EXPIRED", message: "OTP expired" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await cambiar(canvasElement);
    await expect((await within(canvasElement).findAllByText(/expiró/))[0]).toBeVisible();
  },
};

export const DemasiadosIntentos: Story = {
  name: "Código bloqueado",
  parameters: {
    api: {
      ...PEDIR,
      "/api/auth/email-otp/reset-password": {
        status: 403,
        body: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await cambiar(canvasElement);
    await expect(
      (await within(canvasElement).findAllByText(/Demasiados intentos/))[0],
    ).toBeVisible();
  },
};

/** Contraseña cambiada: entra solo y lleva a los chats en 3 segundos. */
export const Listo: Story = {
  parameters: {
    api: {
      ...PEDIR,
      "/api/auth/email-otp/reset-password": { body: { success: true } },
      "/api/auth/sign-in/email": { body: { redirect: false, token: "t", user: {} } },
    },
  },
  play: async ({ canvasElement }) => {
    await cambiar(canvasElement);
    await expect(
      (await within(canvasElement).findAllByText(/cambiaste tu contraseña/))[0],
    ).toBeVisible();
  },
};
