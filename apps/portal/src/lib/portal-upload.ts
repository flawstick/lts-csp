type UploadedFile = {
  url: string;
  name: string;
  size: number;
  type: string;
  category?: "esr" | "financial" | "supporting" | "misc";
};

export async function uploadPortalFile(input: {
  orgId: string;
  taxReturnId: string;
  file: File;
  category?: "esr" | "financial" | "supporting" | "misc";
  accessToken?: string;
}): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("category", input.category ?? "misc");
  if (input.accessToken) {
    formData.append("token", input.accessToken);
  } else {
    formData.append("orgId", input.orgId);
    formData.append("taxReturnId", input.taxReturnId);
  }

  const response = await fetch(
    input.accessToken ? "/api/client-upload" : "/api/upload",
    {
    method: "POST",
    body: formData,
    },
  );
  const result = (await response.json()) as {
    error?: string;
    file?: UploadedFile;
  };

  if (!response.ok || !result.file) {
    throw new Error(result.error ?? "Upload failed.");
  }

  return result.file;
}
