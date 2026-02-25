import axios from "axios";
import { addMinutes } from "date-fns";

const LUMA_API_KEY = process.env.LUMA_API_KEY!;

const LUMA_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  "x-luma-api-key": LUMA_API_KEY,
} as const;

interface UploadUrlResponse {
  upload_url: string;
  file_url: string;
}

interface LumaEventResponse {
  api_id: string;
}

interface LumaEventDetails {
  event: {
    url: string;
  };
}

interface CreateLumaEventParams {
  title: string;
  description: string;
  startAt: Date;
  duration: number;
  meetingUrl?: string;
  coverImage?: Buffer;
}

async function createImageUploadUrl(): Promise<UploadUrlResponse> {
  const response = await axios.post(
    "https://public-api.luma.com/v1/images/create-upload-url",
    { purpose: "event-cover" },
    { headers: LUMA_HEADERS },
  );

  return response.data;
}

async function uploadCoverImage(
  uploadUrl: string,
  imageBuffer: Buffer,
): Promise<void> {
  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      "Content-Type": "image/png",
    },
  });
}

async function createLumaEvent(
  params: CreateLumaEventParams,
): Promise<LumaEventResponse> {
  const { title, description, startAt, duration, meetingUrl, coverImage } =
    params;

  const endDate = addMinutes(startAt, duration);

  let cover_url: string | undefined;
  if (coverImage) {
    const { upload_url, file_url } = await createImageUploadUrl();
    await uploadCoverImage(upload_url, coverImage);
    cover_url = file_url;
  }

  const response = await axios.post<LumaEventResponse>(
    "https://public-api.luma.com/v1/event/create",
    {
      name: title,
      description_md: description,
      start_at: startAt.toISOString(),
      end_at: endDate.toISOString(),
      timezone: "Europe/London",
      cover_url,
      visibility: "public",
      meeting_url: meetingUrl,
    },
    { headers: LUMA_HEADERS },
  );

  return response.data;
}

async function getEventUrl(apiId: string): Promise<string> {
  const response = await axios.get<LumaEventDetails>(
    `https://public-api.luma.com/v1/event/get?id=${apiId}`,
    { headers: LUMA_HEADERS },
  );

  return response.data.event.url;
}

export { createLumaEvent, getEventUrl, CreateLumaEventParams };
