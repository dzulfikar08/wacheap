import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@wacheap/ui/components/button";
import { Input } from "@wacheap/ui/components/input";
import { Label } from "@wacheap/ui/components/label";
import { toast } from "sonner";
import z from "zod";

import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";

import { FieldErrors } from "./field-errors";
import Loader from "./loader";

export default function SignInForm() {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Berhasil masuk");
          },
          onError: (error) => {
            toast.error(authErrorMessage(error.error, "Gagal masuk. Coba lagi."));
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Alamat email tidak valid"),
        password: z.string().min(8, "Kata sandi minimal 8 karakter"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="grid gap-4"
    >
      <form.Field name="email">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>Email</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              aria-describedby={
                field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined
              }
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldErrors id={`${field.name}-error`} errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>Kata sandi</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              aria-describedby={
                field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined
              }
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldErrors id={`${field.name}-error`} errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
      >
        {({ canSubmit, isSubmitting }) => (
          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Memproses…" : "Masuk"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
