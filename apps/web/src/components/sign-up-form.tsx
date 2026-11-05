import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@wacheap/ui/components/button";
import { Input } from "@wacheap/ui/components/input";
import { Label } from "@wacheap/ui/components/label";
import { toast } from "sonner";
import z from "zod";

import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

import { FieldErrors } from "./field-errors";
import Loader from "./loader";

export default function SignUpForm() {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            // Whoever was signed in before must not linger in the shell or in cached data.
            queryClient.clear();
            navigate({
              to: "/dashboard",
            });
            toast.success("Akun berhasil dibuat");
          },
          onError: (error) => {
            toast.error(authErrorMessage(error.error, "Gagal mendaftar. Coba lagi."));
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Nama minimal 2 karakter"),
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
      <form.Field name="name">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>Nama toko atau nama kamu</Label>
            <Input
              id={field.name}
              name={field.name}
              autoComplete="name"
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
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
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
            {isSubmitting ? "Memproses…" : "Buat akun"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
