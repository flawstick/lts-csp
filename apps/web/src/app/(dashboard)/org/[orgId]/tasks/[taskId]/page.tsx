"use client";

import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { api } from "@/trpc/react";
import { describeGuernseyNoticeOfAssessment } from "@repo/database/guernsey-filing";
import { trackClient } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MessageSquare } from "@/lib/icons";
import {
  parseOperatorMessages,
  parsePendingAgentQuestion,
  hasPendingOperatorInterrupt,
} from "@repo/database/operator-messages";

import type { JobEvent, StepEvent, ChatMessage } from "./_components/types";
import { TaskHeader } from "./_components/task-header";
import { BrowserToolbar } from "./_components/browser-toolbar";
import { BrowserFrame } from "./_components/browser-frame";
import { AgentPanel } from "./_components/agent-panel";
import { SubmitLockDialog } from "./_components/submit-lock-dialog";
import { useSubmitDispatchLock } from "./_components/use-submit-dispatch-lock";
import { getJobToCancel } from "./_components/cancel-target";
import {
  StartErrorAlert,
  describeStartAction,
  type StartError,
} from "./_components/start-error-alert";
import {
  buildChatTimeline,
  createClientMessageId,
  deriveComposerState,
  deriveRunActivity,
  isAskedQuestion,
  questionMessageId,
} from "./_components/chat/chat-logic";
import { TaskLoading } from "./_components/task-loading";
import { TaskNotFound } from "./_components/task-not-found";
import { DirectionalTransition } from "@/components/view-transition";

/** Below this width the chat's messages and composer get cramped. */
const AGENT_PANEL_MIN_PX = 320;

/** Panel sizes are percentages; convert a pixel minimum for the group's width. */
function useMinPanelPercent(
  groupEl: HTMLElement | null,
  minPx: number,
  { floor, ceiling }: { floor: number; ceiling: number },
) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!groupEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(groupEl);
    return () => observer.disconnect();
  }, [groupEl]);
  if (width <= 0) return floor;
  const percent = Math.ceil((minPx / width) * 100);
  return Math.min(ceiling, Math.max(floor, percent));
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

type SubmissionMode = "prepare_only" | "submit_and_capture_pdf";

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.taskId as string;
  const orgId = params.orgId as string;

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<StepEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [finalOutput, setFinalOutput] = useState<string | null>(null);
  // Reviewer messages sent from this tab and not yet stored by the server.
  const [sendingMessageIds, setSendingMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isChatSheetOpen, setIsChatSheetOpen] = useState(false);
  // Why the last start request was refused; stays until dismissed or a run starts.
  const [startError, setStartError] = useState<StartError | null>(null);
  // The submit dispatch lock: a toolbar indicator opens its dialog (never
  // opened automatically).
  const submitLock = useSubmitDispatchLock(taskId);
  const [isSubmitLockOpen, setIsSubmitLockOpen] = useState(false);
  const isMobile = useIsMobile();

  const eventSourceRef = useRef<EventSource | null>(null);
  const connectedJobIdRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [panelGroupEl, setPanelGroupEl] = useState<HTMLDivElement | null>(null);
  const agentMinSize = useMinPanelPercent(panelGroupEl, AGENT_PANEL_MIN_PX, {
    floor: 24,
    ceiling: 50,
  });

  // Refs to track latest state for saving (avoids stale closure issues)
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const stepsRef = useRef<StepEvent[]>([]);
  const activeJobIdRef = useRef<string | null>(null);
  const browserJobIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const {
    data: task,
    isLoading,
    refetch,
  } = api.taxReturn.getTask.useQuery({ taskId }, { enabled: !!taskId });

  const startJobMutation = api.taxReturn.startJob.useMutation({
    onSuccess: (data, variables) => {
      // Only now is there a new run: clear the previous run's view.
      setStartError(null);
      setEvents([]);
      setSteps([]);
      setLiveUrl(null);
      setCurrentStep(null);
      setFinalOutput(null);
      setChatMessages([]);
      setSelectedJobId(data.jobId);
      connectToSSE(data.jobId);
      refetch();

      if (task) {
        trackClient({
          name: "job_started",
          data: {
            jobId: data.jobId,
            taskId: task.id,
            taskType: task.taskType || "tax_return",
            jurisdiction: task.taxReturn?.jurisdiction?.name || "unknown",
            entityName: task.name,
            source: variables.overrideSaved ? "retry" : "manual",
            submissionMode: variables.submissionMode ?? "prepare_only",
            filingOperation: variables.filingOperation ?? "fill",
          },
        }).catch(console.error);
      }
    },
    onError: (error, variables) => {
      // The server refused: nothing started, so the current view stays as it
      // was and the reason stays on screen until dismissed.
      setStartError({
        action: describeStartAction(variables),
        message: error.message || "The run could not be started.",
      });
      toast.error(error.message);
      // Refresh readiness so the toolbar shows the current blocker.
      refetch();
    },
  });

  const stopJobMutation = api.taxReturn.stopJob.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const resumeJobMutation = api.taxReturn.resumeJob.useMutation({
    onSuccess: (_data, variables) => {
      refetch();

      // Track job resume
      const job = task?.jobs?.find((j) => j.id === variables.jobId);
      if (job) {
        const pausedTime = job.updatedAt
          ? new Date(job.updatedAt).getTime()
          : Date.now();
        trackClient({
          name: "job_resumed",
          data: {
            jobId: variables.jobId,
            taskId: taskId,
            pausedDurationMs: Date.now() - pausedTime,
          },
        }).catch(console.error);
      }
    },
  });

  const activeJob = task?.jobs?.find(
    (j) =>
      j.status === "queued" ||
      j.status === "starting" ||
      j.status === "running" ||
      j.status === "paused",
  );
  const runningJob = task?.jobs?.find((j) => j.status === "running");
  const pausedJob = task?.jobs?.find((j) => j.status === "paused");
  const latestJob = task?.jobs?.[0];
  const selectedJob = selectedJobId
    ? task?.jobs?.find((j) => j.id === selectedJobId)
    : activeJob || latestJob;
  const allJobs = task?.jobs || [];

  // Mutation to save job data
  const updateJobDataMutation = api.taxReturn.updateJobData.useMutation({
    onError: (error, variables) => {
      console.error("Failed to persist task job data", {
        jobId: variables.jobId,
        hasChatMessages:
          Array.isArray(variables.chatMessages) &&
          variables.chatMessages.length > 0,
        hasSteps: Array.isArray(variables.steps) && variables.steps.length > 0,
        hasLiveUrl:
          typeof variables.liveUrl === "string" && variables.liveUrl.length > 0,
        error: error.message,
      });
    },
  });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    activeJobIdRef.current = activeJob?.id || pausedJob?.id || null;
  }, [activeJob?.id, pausedJob?.id]);

  const getStoredLiveUrl = useCallback(
    (job: { resultData?: unknown } | null | undefined) => {
      const resultData = job?.resultData as
        | Record<string, unknown>
        | null
        | undefined;
      return typeof resultData?.liveUrl === "string" &&
        resultData.liveUrl.trim()
        ? resultData.liveUrl.trim()
        : null;
    },
    [],
  );

  const extractLiveUrl = useCallback((event: JobEvent) => {
    const eventData = event.data as Record<string, unknown>;
    if (typeof eventData.liveUrl === "string" && eventData.liveUrl.trim()) {
      return eventData.liveUrl.trim();
    }

    const stepData = event.data as StepEvent;
    if (typeof stepData.liveUrl === "string" && stepData.liveUrl.trim()) {
      return stepData.liveUrl.trim();
    }

    return typeof stepData.url === "string" && stepData.url.trim()
      ? stepData.url.trim()
      : null;
  }, []);

  const serializeSteps = useCallback((jobSteps: StepEvent[]) => {
    return jobSteps.map((step) => ({
      stepNumber: normalizeOptionalNumber(step.stepNumber),
      goal: normalizeOptionalString(step.goal),
      memory: normalizeOptionalString(step.memory),
      url: normalizeOptionalString(step.url),
      message: normalizeOptionalString(step.message),
      timestamp: normalizeOptionalNumber(step.timestamp),
    }));
  }, []);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    connectedJobIdRef.current = null;
    setIsConnected(false);
  }, []);

  // Save job data immediately (no debounce) - used for important events
  const saveJobDataImmediate = useCallback(
    (jobId: string, chat: ChatMessage[], jobSteps: StepEvent[]) => {
      if (chat.length === 0 && jobSteps.length === 0) {
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      updateJobDataMutation.mutate({
        jobId,
        chatMessages: chat,
        steps: serializeSteps(jobSteps),
      });
    },
    [serializeSteps, updateJobDataMutation],
  );

  // Save chat and steps with debounce
  const saveJobData = useCallback(
    (jobId: string, chat: ChatMessage[], jobSteps: StepEvent[]) => {
      if (chat.length === 0 && jobSteps.length === 0) {
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        updateJobDataMutation.mutate({
          jobId,
          chatMessages: chat,
          steps: serializeSteps(jobSteps),
        });
      }, 2000);
    },
    [serializeSteps, updateJobDataMutation],
  );

  // Load chat and steps from a job's resultData
  const loadJobChat = useCallback(
    (job: typeof latestJob) => {
      if (!job) return;

      const resultData = job.resultData as Record<string, unknown> | null;

      if (resultData?.chatMessages && Array.isArray(resultData.chatMessages)) {
        const messages = resultData.chatMessages as ChatMessage[];
        const seen = new Set<string>();
        const deduped = messages.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setChatMessages(deduped);
      } else {
        // Only what the agent reported; run status is shown outside the chat.
        const messages: ChatMessage[] = [];
        if (typeof resultData?.output === "string" && resultData.output.trim()) {
          messages.push({
            id: `output-${job.id}`,
            role: "assistant",
            content: resultData.output,
            timestamp: job.completedAt
              ? new Date(job.completedAt).getTime()
              : new Date(job.startedAt || job.createdAt).getTime(),
          });
        }

        setChatMessages(messages);
      }

      if (resultData?.steps && Array.isArray(resultData.steps)) {
        setSteps(
          (resultData.steps as StepEvent[]).map((step) => ({
            ...step,
            stepNumber: normalizeOptionalNumber(step.stepNumber),
            goal: normalizeOptionalString(step.goal),
            memory: normalizeOptionalString(step.memory),
            liveUrl: normalizeOptionalString(step.liveUrl),
            url: normalizeOptionalString(step.url),
            message: normalizeOptionalString(step.message),
            timestamp: normalizeOptionalNumber(step.timestamp),
          })),
        );
      } else {
        setSteps([]);
      }

      setLiveUrl(getStoredLiveUrl(job));
    },
    [getStoredLiveUrl],
  );

  // Auto-select latest job on load
  useEffect(() => {
    if (task?.jobs?.length && !selectedJobId) {
      const jobToSelect = activeJob || latestJob;
      if (jobToSelect) {
        setSelectedJobId(jobToSelect.id);
        if (
          jobToSelect.status !== "running" &&
          jobToSelect.status !== "queued" &&
          jobToSelect.status !== "starting"
        ) {
          loadJobChat(jobToSelect);
        }
      }
    }
  }, [task?.jobs, activeJob, latestJob, selectedJobId, loadJobChat]);

  // Handle job selection change
  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = task?.jobs?.find((j) => j.id === jobId);
    if (job) {
      setSteps([]);
      setCurrentStep(null);
      setEvents([]);
      loadJobChat(job);

      if (
        job.status === "running" ||
        job.status === "queued" ||
        job.status === "starting" ||
        job.status === "paused"
      ) {
        connectToSSE(job.id);
      } else {
        closeEventSource();
      }
    }
  };

  const connectToSSE = useCallback(
    (jobId: string) => {
      closeEventSource();

      const es = new EventSource(`/api/jobs/${jobId}/events`);
      eventSourceRef.current = es;
      connectedJobIdRef.current = jobId;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as JobEvent & { type: string };

          if (!data.type?.startsWith("job:")) {
            console.log("SSE connected:", data);
            return;
          }

          setEvents((prev) => [...prev, data as JobEvent]);
          const eventLiveUrl = extractLiveUrl(data as JobEvent);
          if (eventLiveUrl) {
            setLiveUrl((prev) => (prev === eventLiveUrl ? prev : eventLiveUrl));
          }

          if (data.type === "job:step" || data.type === "job:progress") {
            const stepData = {
              ...(data.data as StepEvent),
              timestamp: data.timestamp ?? Date.now(),
            };
            setCurrentStep(stepData);

            // Only the agent's own updates (they carry a goal) are kept; worker
            // log lines and status pings are not part of the conversation.
            if (stepData.goal) {
              setSteps((prev) =>
                prev.some(
                  (s) =>
                    s.stepNumber === stepData.stepNumber &&
                    s.goal === stepData.goal,
                )
                  ? prev
                  : [...prev, stepData],
              );
            }
          }

          if (data.type === "job:started") {
            refetch();
          }

          if (data.type === "job:requires_attention") {
            // Only a question the agent asked belongs in the conversation. A
            // manual pause or a pause to deliver a message is run status.
            const question = parsePendingAgentQuestion(data.data);
            if (question && isAskedQuestion(question)) {
              const id = questionMessageId(question);
              setChatMessages((prev) =>
                prev.some((m) => m.id === id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id,
                        role: "assistant",
                        content: question.text,
                        timestamp: question.askedAt,
                      },
                    ],
              );
              setIsChatSheetOpen(true);
            }
            refetch();
          }

          if (data.type === "job:resumed" || data.type === "job:operator_reply") {
            refetch();
          }

          if (data.type === "job:completed" || data.type === "job:failed") {
            closeEventSource();
            const output = data.data?.output as string;

            const currentMessages = [...chatMessagesRef.current];
            const currentSteps = [...stepsRef.current];

            if (output) {
              setFinalOutput(output);
              const finalMsg = {
                id: `final-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                role: "assistant" as const,
                content: output,
                timestamp: Date.now(),
              };
              currentMessages.push(finalMsg);
              setChatMessages((prev) => [...prev, finalMsg]);
            }

            if (data.jobId) {
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
              }
              if (currentMessages.length > 0 || currentSteps.length > 0) {
                updateJobDataMutation.mutate({
                  jobId: data.jobId,
                  chatMessages: currentMessages,
                  steps: serializeSteps(currentSteps),
                });
              }
            }

            refetch();

            const job = task?.jobs?.find((j) => j.id === data.jobId);
            if (job && task) {
              const startTime = job.startedAt
                ? new Date(job.startedAt).getTime()
                : Date.now();
              const duration = Date.now() - startTime;

              if (data.type === "job:completed") {
                trackClient({
                  name: "job_completed",
                  data: {
                    jobId: data.jobId,
                    taskId: taskId,
                    success: true,
                    totalDurationMs: duration,
                    stepsCompleted: currentSteps.length,
                    autoApproved: true,
                  },
                }).catch(console.error);
              } else {
                trackClient({
                  name: "job_failed",
                  data: {
                    jobId: data.jobId,
                    taskId: taskId,
                    errorType: (data.data?.errorType as string) || "unknown",
                    stage: currentStep?.goal || "unknown",
                    durationMs: duration,
                  },
                }).catch(console.error);
              }
            }
          }
        } catch (err) {
          console.error("Failed to parse SSE event:", err);
        }
      };

      es.onerror = () => {
        setIsConnected(false);
      };
    },
    [
      closeEventSource,
      extractLiveUrl,
      refetch,
      serializeSteps,
      task,
      taskId,
      currentStep,
      updateJobDataMutation,
    ],
  );

  // Auto-connect if there's an active job
  useEffect(() => {
    const browserJob = selectedJob || activeJob || latestJob;
    const storedLiveUrl = getStoredLiveUrl(browserJob);
    const browserJobId = browserJob?.id || null;

    if (browserJobId !== browserJobIdRef.current) {
      browserJobIdRef.current = browserJobId;
      setLiveUrl(storedLiveUrl);
    } else if (storedLiveUrl && storedLiveUrl !== liveUrl) {
      setLiveUrl(storedLiveUrl);
    }

    if (
      browserJob &&
      (browserJob.status === "running" ||
        browserJob.status === "queued" ||
        browserJob.status === "starting" ||
        browserJob.status === "paused")
    ) {
      if (connectedJobIdRef.current !== browserJob.id) {
        connectToSSE(browserJob.id);
      }
    } else if (connectedJobIdRef.current) {
      closeEventSource();
    }
  }, [
    selectedJob,
    activeJob,
    latestJob,
    getStoredLiveUrl,
    liveUrl,
    connectToSSE,
    closeEventSource,
  ]);

  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  // Polling for job status updates
  useEffect(() => {
    const activeJobForPolling = runningJob || pausedJob || latestJob;
    if (
      !activeJobForPolling ||
      (activeJobForPolling.status !== "running" &&
        activeJobForPolling.status !== "queued" &&
        activeJobForPolling.status !== "starting" &&
        activeJobForPolling.status !== "paused")
    ) {
      return;
    }

    const interval = setInterval(() => {
      refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [runningJob, pausedJob, latestJob, refetch]);

  // The agent panel follows new chat messages itself, and only while the
  // reader is at the end of the transcript.

  // Save chat and steps when they change (only for active jobs)
  useEffect(() => {
    const activeJobForSave = activeJob || pausedJob;
    if (activeJobForSave && (chatMessages.length > 0 || steps.length > 0)) {
      saveJobData(activeJobForSave.id, chatMessages, steps);
    }
  }, [chatMessages, steps, runningJob, pausedJob, saveJobData]);

  // Cleanup on unmount: flush any pending saves
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const activeJobId = activeJobIdRef.current;
      if (
        activeJobId &&
        (chatMessagesRef.current.length > 0 || stepsRef.current.length > 0)
      ) {
        const data = {
          jobId: activeJobId,
          chatMessages: chatMessagesRef.current,
          steps: serializeSteps(stepsRef.current),
        };
        navigator.sendBeacon("/api/jobs/save-data", JSON.stringify(data));
      }
    };
  }, [serializeSteps]);

  const handleStart = ({
    overrideSaved = false,
    submissionMode = "prepare_only",
    filingOperation,
  }: {
    overrideSaved?: boolean;
    submissionMode?: SubmissionMode;
    filingOperation?: "submit_prepared";
  } = {}) => {
    // The previous run's view is cleared only once the server accepts the
    // start (see startJobMutation.onSuccess); a refusal leaves it in place.
    setStartError(null);
    startJobMutation.mutate({
      taskId,
      overrideSaved,
      submissionMode,
      ...(filingOperation ? { filingOperation } : {}),
    });
  };

  const handlePause = () => {
    if (runningJob) {
      stopJobMutation.mutate({ jobId: runningJob.id });

      const startTime = runningJob.startedAt
        ? new Date(runningJob.startedAt).getTime()
        : Date.now();
      trackClient({
        name: "job_paused",
        data: {
          jobId: runningJob.id,
          taskId: taskId,
          reason: "user_requested",
          durationMs: Date.now() - startTime,
        },
      }).catch(console.error);
    }
  };

  const cancelJobMutation = api.taxReturn.cancelJob.useMutation({
    onSuccess: () => {
      setLiveUrl(null);
      refetch();
    },
  });

  const deleteJobMutation = api.taxReturn.deleteJob.useMutation({
    onSuccess: () => {
      if (task?.jobs && task.jobs.length > 1) {
        const remainingJobs = task.jobs.filter((j) => j.id !== selectedJobId);
        if (remainingJobs.length > 0) {
          setSelectedJobId(remainingJobs[0]?.id || null);
        } else {
          setSelectedJobId(null);
        }
      } else {
        setSelectedJobId(null);
      }
      setLiveUrl(null);
      setChatMessages([]);
      setSteps([]);
      refetch();
    },
  });

  const handleCancel = () => {
    const jobToCancel = getJobToCancel({ runningJob, pausedJob, activeJob });
    if (jobToCancel) {
      cancelJobMutation.mutate({ jobId: jobToCancel.id });
    }
  };

  const sendAgentMessageMutation = api.taxReturn.sendAgentMessage.useMutation();

  const handleSendMessage = () => {
    const content = messageInput.trim();
    // Only the run shown in the chat can receive its messages.
    const targetJob =
      selectedJob &&
      (selectedJob.status === "paused" || selectedJob.status === "running")
        ? selectedJob
        : null;
    if (!content || !targetJob || sendAgentMessageMutation.isPending) return;

    const id = createClientMessageId();
    setSendingMessageIds((prev) => new Set(prev).add(id));
    setChatMessages((prev) => [
      ...prev,
      { id, role: "user", content, timestamp: Date.now() },
    ]);
    setMessageInput("");

    const clearSending = () =>
      setSendingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

    sendAgentMessageMutation.mutate(
      { jobId: targetJob.id, clientMessageId: id, content },
      {
        onSuccess: async (result) => {
          // Keep "sending" until the stored copy (with delivery state) is loaded.
          await refetch();
          clearSending();
          if (result.delivery === "resuming") {
            trackClient({
              name: "job_resumed",
              data: {
                jobId: targetJob.id,
                taskId,
                pausedDurationMs:
                  Date.now() -
                  (targetJob.updatedAt
                    ? new Date(targetJob.updatedAt).getTime()
                    : Date.now()),
              },
            }).catch(console.error);
          }
        },
        onError: (error) => {
          clearSending();
          setChatMessages((prev) => prev.filter((m) => m.id !== id));
          setMessageInput((current) => current || content);
          toast.error(error.message || "Message not sent. Try again.");
          refetch();
        },
      },
    );
  };

  // ── Loading ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <DirectionalTransition>
        <TaskLoading />
      </DirectionalTransition>
    );
  }

  // ── Not found ──────────────────────────────────────────────────

  if (!task) {
    return (
      <DirectionalTransition>
        <TaskNotFound orgId={orgId} />
      </DirectionalTransition>
    );
  }

  // ── Helpers ────────────────────────────────────────────────────

  const jurisdictionName = task.taxReturn?.jurisdiction?.name ?? null;
  const entityName = task.taxReturn?.entityName ?? null;
  // The answer a Guernsey ESR submit selects on the declaration page.
  const noticeOfAssessmentLabel =
    task.taxReturn?.jurisdiction?.code === "GG" &&
    task.taxReturn.returnType === "economic_substance"
      ? describeGuernseyNoticeOfAssessment(task.taxReturn.substanceForm)
      : null;
  const browserStatus = selectedJob?.status ?? activeJob?.status ?? null;

  const chatJobStatus = selectedJob?.status ?? null;
  const chatResultData = selectedJob?.resultData;
  const operatorMessages = parseOperatorMessages(chatResultData);
  const pendingQuestion =
    chatJobStatus === "paused" ? parsePendingAgentQuestion(chatResultData) : null;
  const chatTimeline = buildChatTimeline({
    chatMessages,
    operatorMessages,
    jobStatus: chatJobStatus,
    steps,
    question: pendingQuestion,
    sendingIds: sendingMessageIds,
  });
  // Mirrors the worker: anything but an explicit submit run is prepare-only.
  const isPrepareOnlyRun =
    (chatResultData as Record<string, unknown> | null | undefined)
      ?.submissionMode !== "submit_and_capture_pdf";
  // Status questions are answered by the worker without pausing the agent.
  const hasPendingDelivery = operatorMessages.some(
    (m) => m.status === "pending" && m.kind !== "status",
  );
  const runActivity = deriveRunActivity({
    jobStatus: chatJobStatus,
    question: pendingQuestion,
    hasPendingInterrupt: hasPendingOperatorInterrupt(chatResultData),
    hasPendingDelivery,
    errorMessage: selectedJob?.errorMessage ?? null,
  });
  const composerState = deriveComposerState({
    jobStatus: chatJobStatus,
    question: pendingQuestion,
    hasPendingDelivery,
    isSending: sendAgentMessageMutation.isPending || sendingMessageIds.size > 0,
    isPrepareOnly: isPrepareOnlyRun,
  });
  const needsReply = chatJobStatus === "paused";

  const agentPanel = (onClose?: () => void) => (
    <AgentPanel
      entityName={entityName}
      orgId={orgId}
      taxReturnId={task.taxReturn?.id}
      isSubstanceFormIncomplete={
        !!(
          task.taxReturn?.substanceForm &&
          !task.taxReturn.substanceForm.isComplete
        )
      }
      jobStatus={chatJobStatus}
      isPrepareOnly={isPrepareOnlyRun}
      question={pendingQuestion}
      timeline={chatTimeline}
      activity={runActivity}
      composer={composerState}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      onSendMessage={handleSendMessage}
      onResumeWithoutMessage={
        selectedJob?.status === "paused"
          ? () => resumeJobMutation.mutate({ jobId: selectedJob.id })
          : undefined
      }
      isResumePending={resumeJobMutation.isPending}
      scrollRef={chatScrollRef}
      onClose={onClose}
    />
  );

  // ── Main render ────────────────────────────────────────────────

  return (
    <DirectionalTransition>
      <div className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <TaskHeader
        orgId={orgId}
        taskName={task.name}
        taskStatus={browserStatus ?? task.status}
        jurisdictionName={jurisdictionName}
        entityName={entityName}
        isConnected={isConnected}
        taxReturnId={task.taxReturn?.id}
      />

      <div ref={setPanelGroupEl} className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Browser panel */}
          <ResizablePanel id="browser" order={1} defaultSize={68} minSize={30}>
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              <BrowserToolbar
                orgId={orgId}
                jurisdictionName={jurisdictionName}
                entityName={entityName}
                taskStatus={browserStatus ?? task.status}
                isConnected={isConnected}
                taxReturnId={task.taxReturn?.id}
                liveUrl={liveUrl}
                iframeRef={iframeRef}
                allJobs={allJobs}
                selectedJobId={selectedJobId}
                selectedJob={selectedJob}
                activeJob={activeJob ?? null}
                runningJob={runningJob ?? null}
                pausedJob={pausedJob ?? null}
                onSelectJob={handleSelectJob}
                onPause={handlePause}
                onCancel={handleCancel}
                onResume={(jobId) => resumeJobMutation.mutate({ jobId })}
                onStart={handleStart}
                onDeleteJob={(jobId) => deleteJobMutation.mutate({ jobId })}
                isStartPending={startJobMutation.isPending}
                isPausePending={stopJobMutation.isPending}
                isCancelPending={cancelJobMutation.isPending}
                isResumePending={resumeJobMutation.isPending}
                isDeletePending={deleteJobMutation.isPending}
                submitReadiness={task.submitReadiness ?? null}
                noticeOfAssessmentLabel={noticeOfAssessmentLabel}
                onActionsMenuOpen={() => {
                  void refetch();
                }}
                submitLocked={submitLock.isLocked}
                onOpenSubmitLock={() => setIsSubmitLockOpen(true)}
              />

              {startError ? (
                <StartErrorAlert
                  error={startError}
                  onDismiss={() => setStartError(null)}
                />
              ) : null}

              <SubmitLockDialog
                taskId={taskId}
                lock={submitLock.lock}
                open={isSubmitLockOpen}
                onOpenChange={setIsSubmitLockOpen}
                onSelectJob={handleSelectJob}
                onStopBrowser={submitLock.stopBrowser}
                stoppingJobId={submitLock.stoppingJobId}
                isStopPending={submitLock.isStopPending}
                onRecordNotSubmitted={submitLock.recordNotSubmitted}
                isRecordPending={submitLock.isRecordPending}
              />

              <BrowserFrame
                liveUrl={liveUrl}
                iframeRef={iframeRef}
                jobStatus={browserStatus}
                errorMessage={selectedJob?.errorMessage ?? null}
                isStartPending={startJobMutation.isPending}
                onStart={() => handleStart()}
              />
            </div>
          </ResizablePanel>

          {/* Agent chat: side panel on desktop, sheet on phones */}
          {!isMobile ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="agent"
                order={2}
                defaultSize={32}
                minSize={agentMinSize}
                maxSize={50}
              >
                {agentPanel()}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      {isMobile ? (
        <>
          <Button
            onClick={() => setIsChatSheetOpen(true)}
            className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-11 gap-2 rounded-full px-4 shadow-lg"
            aria-label={needsReply ? "Open agent chat: the agent is waiting for you" : "Open agent chat"}
          >
            <MessageSquare className="size-4" />
            Agent
            {needsReply ? (
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
              </span>
            ) : null}
          </Button>
          <Sheet open={isChatSheetOpen} onOpenChange={setIsChatSheetOpen}>
            <SheetContent
              side="right"
              className="w-full gap-0 p-0 sm:max-w-md [&>button:last-child]:hidden"
            >
              <SheetTitle className="sr-only">Agent chat</SheetTitle>
              {agentPanel(() => setIsChatSheetOpen(false))}
            </SheetContent>
          </Sheet>
        </>
      ) : null}
      </div>
    </DirectionalTransition>
  );
}
