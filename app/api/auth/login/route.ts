const opcoesCookie = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 8,
      path: "/",
    };