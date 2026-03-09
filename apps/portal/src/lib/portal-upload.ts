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
}): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("orgId", input.orgId);
  formData.append("taxReturnId", input.taxReturnId);
  formData.append("category", input.category ?? "misc");

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const result = (await response.json()) as {
    error?: string;
    file?: UploadedFile;
  };

  if (!response.ok || !result.file) {
    throw new Error(result.error ?? "Upload failed.");
  }

  return result.file;
}
