"use client"

import { useParams } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import {
  Play,
  Square,
  Loader2,
  Monitor,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Send,
  ArrowLeft,
  Bot,
  User,
  Maximize2,
  Minimize2,
  History,
  ChevronDown,
  XCircle,
  Clock,
  Pause,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { api } from "@/trpc/react"

// Types for SSE events
interface JobEvent {
  type: "connected" | "job:started" | "job:progress" | "job:step" | "job:completed" | "job:failed" | "job:requires_attention"
  jobId: string
  timestamp: number
  data: Record<string, unknown>
}

interface StepEvent {
  stepNumber?: number
  goal?: string
  memory?: string
  url?: string
  actions?: unknown[]
  screenshotUrl?: string
  message?: string
  output?: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export default function TaskDetailPage() {
  const params = useParams()
  const taskId = params.taskId as string

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [steps, setSteps] = useState<StepEvent[]>([])
  const [currentStep, setCurrentStep] = useState<StepEvent | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState("")
  const [finalOutput, setFinalOutput] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const stepsScrollRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { data: task, isLoading, refetch } = api.taxReturn.getTask.useQuery(
    { taskId },
    { enabled: !!taskId }
  )

  const startJobMutation = api.taxReturn.startJob.useMutation({
    onSuccess: (data) => {
      setSelectedJobId(data.jobId)
      connectToSSE(data.jobId)
      setChatMessages([{
        id: `sys-${Date.now()}`,
        role: "assistant",
        content: "Task started. I'm now automating the form submission...",
        timestamp: Date.now()
      }])
      refetch()
    },
  })

  const stopJobMutation = api.taxReturn.stopJob.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const resumeJobMutation = api.taxReturn.resumeJob.useMutation({
    onSuccess: () => {
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: "assistant",
        content: "Resuming task... The agent will continue from where it left off.",
        timestamp: Date.now()
      }])
      refetch()
    },
  })

  const activeJob = task?.jobs?.find(j => j.status === "running" || j.status === "queued" || j.status === "paused")
  const runningJob = task?.jobs?.find(j => j.status === "running" || j.status === "queued")
  const pausedJob = task?.jobs?.find(j => j.status === "paused")
  const latestJob = task?.jobs?.[0]
  const selectedJob = selectedJobId ? task?.jobs?.find(j => j.id === selectedJobId) : (activeJob || latestJob)
  const allJobs = task?.jobs || []

  // Mutation to save job data
  const updateJobDataMutation = api.taxReturn.updateJobData.useMutation()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Save chat and steps with debounce
  const saveJobData = useCallback((jobId: string, chat: ChatMessage[], jobSteps: StepEvent[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      updateJobDataMutation.mutate({
        jobId,
        chatMessages: chat,
        steps: jobSteps.map(s => ({
          stepNumber: s.stepNumber,
          goal: s.goal,
          memory: s.memory,
          url: s.url,
          message: s.message,
        })),
      })
    }, 2000) // Debounce 2 seconds
  }, [updateJobDataMutation])

  // Load chat and steps from a job's resultData
  const loadJobChat = useCallback((job: typeof latestJob) => {
    if (!job) return

    const resultData = job.resultData as Record<string, unknown> | null

    // Load saved chat messages if available
    if (resultData?.chatMessages && Array.isArray(resultData.chatMessages)) {
      setChatMessages(resultData.chatMessages as ChatMessage[])
    } else {
      // Fallback to basic messages
      const messages: ChatMessage[] = []

      // Add start message
      messages.push({
        id: `start-${job.id}`,
        role: "assistant",
        content: `Task started at ${new Date(job.startedAt || job.createdAt).toLocaleString()}`,
        timestamp: new Date(job.startedAt || job.createdAt).getTime()
      })

      // Add output message if exists
      if (resultData?.output) {
        const isError = job.status === "failed" || (resultData.isSuccess === false)
        messages.push({
          id: `output-${job.id}`,
          role: "assistant",
          content: isError
            ? `⚠️ ${resultData.output as string}`
            : resultData.output as string,
          timestamp: job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
        })
      }

      // Add error message if exists
      if (job.errorMessage) {
        messages.push({
          id: `error-${job.id}`,
          role: "assistant",
          content: `❌ Error: ${job.errorMessage}`,
          timestamp: job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
        })
      }

      setChatMessages(messages)
    }

    // Load saved steps if available
    if (resultData?.steps && Array.isArray(resultData.steps)) {
      setSteps(resultData.steps as StepEvent[])
    } else {
      setSteps([])
    }

    // Set liveUrl if available
    if (resultData?.liveUrl) {
      setLiveUrl(resultData.liveUrl as string)
    }
  }, [])

  // Auto-select latest job on load
  useEffect(() => {
    if (task?.jobs?.length && !selectedJobId) {
      const jobToSelect = activeJob || latestJob
      if (jobToSelect) {
        setSelectedJobId(jobToSelect.id)
        // Only load chat for completed/failed jobs (not running ones - they'll stream)
        if (jobToSelect.status !== "running" && jobToSelect.status !== "queued") {
          loadJobChat(jobToSelect)
        }
      }
    }
  }, [task?.jobs, activeJob, latestJob, selectedJobId, loadJobChat])

  // Handle job selection change
  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId)
    const job = task?.jobs?.find(j => j.id === jobId)
    if (job) {
      setSteps([])
      setCurrentStep(null)
      setEvents([])
      loadJobChat(job)

      // Connect to SSE if job is active
      if (job.status === "running" || job.status === "queued" || job.status === "paused") {
        connectToSSE(job.id)
      } else {
        // Disconnect from SSE for completed jobs
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        setIsConnected(false)
      }
    }
  }

  const connectToSSE = useCallback((jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/jobs/${jobId}/events`)
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as JobEvent & { type: string }

        if (!data.type?.startsWith("job:")) {
          console.log("SSE connected:", data)
          return
        }

        setEvents(prev => [...prev, data as JobEvent])

        if (data.type === "job:started" && data.data?.liveUrl) {
          setLiveUrl(data.data.liveUrl as string)
        }

        if (data.type === "job:step" || data.type === "job:progress") {
          const stepData = data.data as StepEvent
          setCurrentStep(stepData)

          // Add to steps list if it has a step number or goal
          if (stepData.stepNumber || stepData.goal || stepData.message) {
            setSteps(prev => {
              // Avoid duplicates by checking step number
              if (stepData.stepNumber && prev.some(s => s.stepNumber === stepData.stepNumber)) {
                return prev.map(s => s.stepNumber === stepData.stepNumber ? stepData : s)
              }
              return [...prev, stepData]
            })
          }

          // Add to chat as assistant message
          if (stepData.goal || stepData.message) {
            setChatMessages(prev => [...prev, {
              id: `step-${Date.now()}`,
              role: "assistant",
              content: stepData.goal || stepData.message || "Processing...",
              timestamp: Date.now()
            }])
          }
        }

        if (data.type === "job:requires_attention") {
          // Job is paused, waiting for user intervention
          const message = data.data?.message as string || data.data?.output as string
          setChatMessages(prev => [...prev, {
            id: `attention-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${message || "I need your help to continue. Please complete the required action in the browser (e.g., login) and click Resume."}`,
            timestamp: Date.now()
          }])
          refetch()
        }

        if (data.type === "job:completed" || data.type === "job:failed") {
          setIsConnected(false)
          const output = data.data?.output as string
          if (output) {
            setFinalOutput(output)
            setChatMessages(prev => [...prev, {
              id: `final-${Date.now()}`,
              role: "assistant",
              content: output,
              timestamp: Date.now()
            }])
          }
          refetch()
        }

      } catch (err) {
        console.error("Failed to parse SSE event:", err)
      }
    }

    es.onerror = () => {
      setIsConnected(false)
    }

    return () => {
      es.close()
    }
  }, [refetch])

  // Auto-connect if there's an active job (running, queued, or paused)
  useEffect(() => {
    const activeJobForSSE = runningJob || pausedJob || latestJob

    if (activeJobForSSE && (activeJobForSSE.status === "running" || activeJobForSSE.status === "queued" || activeJobForSSE.status === "paused")) {
      if (!eventSourceRef.current) {
        connectToSSE(activeJobForSSE.id)
      }

      const resultData = activeJobForSSE.resultData as Record<string, unknown> | null
      if (resultData?.liveUrl && !liveUrl) {
        setLiveUrl(resultData.liveUrl as string)
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [runningJob, pausedJob, latestJob, connectToSSE, liveUrl])

  // Polling for job status updates
  useEffect(() => {
    const activeJobForPolling = runningJob || pausedJob || latestJob
    if (!activeJobForPolling || (activeJobForPolling.status !== "running" && activeJobForPolling.status !== "queued" && activeJobForPolling.status !== "paused")) {
      return
    }

    const interval = setInterval(() => {
      refetch()
    }, 5000)

    return () => clearInterval(interval)
  }, [runningJob, pausedJob, latestJob, refetch])

  // Auto-scroll steps
  useEffect(() => {
    if (stepsScrollRef.current) {
      stepsScrollRef.current.scrollLeft = stepsScrollRef.current.scrollWidth
    }
  }, [steps])

  // Auto-scroll chat
  useEffect(() => {
    const scrollAreaRoot = chatScrollRef.current
    if (scrollAreaRoot) {
      const viewport = scrollAreaRoot.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [chatMessages])

  // Save chat and steps when they change (only for active jobs)
  useEffect(() => {
    const activeJobForSave = runningJob || pausedJob
    if (activeJobForSave && (chatMessages.length > 1 || steps.length > 0)) {
      saveJobData(activeJobForSave.id, chatMessages, steps)
    }
  }, [chatMessages, steps, runningJob, pausedJob, saveJobData])

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleStart = (overrideSaved = false) => {
    setEvents([])
    setSteps([])
    setLiveUrl(null)
    setCurrentStep(null)
    setFinalOutput(null)
    setChatMessages([])
    startJobMutation.mutate({ taskId, overrideSaved })
  }

  const handlePause = () => {
    if (runningJob) {
      stopJobMutation.mutate({ jobId: runningJob.id })
    }
  }

  const cancelJobMutation = api.taxReturn.cancelJob.useMutation({
    onSuccess: () => {
      setLiveUrl(null)
      refetch()
    },
  })

  const deleteJobMutation = api.taxReturn.deleteJob.useMutation({
    onSuccess: () => {
      // If we deleted the selected job, select the latest one
      if (task?.jobs && task.jobs.length > 1) {
        const remainingJobs = task.jobs.filter(j => j.id !== selectedJobId)
        if (remainingJobs.length > 0) {
          setSelectedJobId(remainingJobs[0]?.id || null)
        } else {
          setSelectedJobId(null)
        }
      } else {
        setSelectedJobId(null)
      }
      setLiveUrl(null)
      setChatMessages([])
      setSteps([])
      refetch()
    },
  })

  const handleCancel = () => {
    const jobToCancel = runningJob || pausedJob
    if (jobToCancel) {
      cancelJobMutation.mutate({ jobId: jobToCancel.id })
    }
  }

  const handleSendMessage = () => {
    if (!messageInput.trim()) return

    setChatMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageInput,
      timestamp: Date.now()
    }])

    // TODO: Actually send to browser-use agent
    setMessageInput("")
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>
      case "running":
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Running</Badge>
      case "paused":
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Paused - Action Required</Badge>
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>
    }
  }

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "running":
      case "queued":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case "paused":
        return <Pause className="h-4 w-4 text-orange-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "cancelled":
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  if (isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="overflow-hidden flex flex-col h-screen">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-2 px-4 flex-1">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Separator orientation="vertical" className="h-4" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2 px-4">
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={70} minSize={30}>
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-16 rounded-md" />
                    </div>
                  </div>
                  <div className="flex-1 bg-muted/10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/20" />
                  </div>
                  <div className="border-t bg-background shrink-0 h-48 p-4 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-3 overflow-hidden">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-64 flex-shrink-0 rounded-lg" />
                      ))}
                    </div>
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <div className="flex flex-col h-full bg-background border-l">
                  <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex-1 p-4 space-y-4">
                    <div className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-16 w-3/4 rounded-lg" />
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-12 w-1/2 rounded-lg" />
                    </div>
                  </div>
                  <div className="p-4 border-t bg-background shrink-0">
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!task) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Task not found</p>
            <Button asChild>
              <Link href="/tasks">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tasks
              </Link>
            </Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden flex flex-col h-screen">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2 px-4 flex-1">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/tasks">Tasks</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate max-w-[300px]">{task.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2 px-4">
            {getStatusBadge(task.status)}
            {isConnected && (
              <Badge variant="outline" className="animate-pulse">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500 inline-block" />
                Live
              </Badge>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Main Content (Browser) */}
            <ResizablePanel defaultSize={70} minSize={30}>
              <div className="flex flex-col h-full">
                {/* Browser Controls */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Guernsey Tax Portal</span>
                    {liveUrl && (
                      <a
                        href={liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {/* Jobs Dropdown */}
                    {allJobs.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1.5">
                            <History className="h-3.5 w-3.5" />
                            <span className="text-xs">Job {selectedJob?.jobNumber || 1}</span>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Job History ({allJobs.length} jobs)
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {allJobs.map((job) => (
                            <DropdownMenuItem
                              key={job.id}
                              onClick={() => handleSelectJob(job.id)}
                              className={`gap-2 cursor-pointer ${selectedJobId === job.id ? 'bg-accent' : ''}`}
                            >
                              {getJobStatusIcon(job.status)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">Job #{job.jobNumber}</span>
                                  <span className="text-[10px] text-muted-foreground capitalize">{job.status}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(job.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {job.status !== "running" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-50 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteJobMutation.mutate({ jobId: job.id })
                                  }}
                                  disabled={deleteJobMutation.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setIsBrowserFullscreen(!isBrowserFullscreen)}
                    >
                      {isBrowserFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                    {runningJob ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7"
                          onClick={handlePause}
                          disabled={stopJobMutation.isPending}
                        >
                          {stopJobMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pause className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Pause
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={handleCancel}
                          disabled={cancelJobMutation.isPending}
                          title="Cancel job"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    ) : pausedJob ? (
                      <>
                        <Button
                          size="sm"
                          className="h-7 bg-orange-500 hover:bg-orange-600"
                          onClick={() => resumeJobMutation.mutate({ jobId: pausedJob.id })}
                          disabled={resumeJobMutation.isPending}
                        >
                          {resumeJobMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Resume
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={handleCancel}
                          disabled={cancelJobMutation.isPending}
                          title="Cancel job"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            className="h-7"
                            disabled={startJobMutation.isPending || !task.taxReturn?.substanceForm?.isComplete}
                          >
                            {startJobMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Start
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleStart(false)}>
                            <Play className="mr-2 h-4 w-4" />
                            Start normally
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStart(true)}>
                            <History className="mr-2 h-4 w-4" />
                            Override saved (redo all)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Browser Frame */}
                <div className="flex-1 bg-muted/50 relative min-h-0">
                                {liveUrl ? (
                                  <iframe
                                    src={liveUrl}
                                    className="w-full h-full border-0"
                                    allow="clipboard-write"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/5 text-muted-foreground gap-6">
                                    {runningJob ? (
                                      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-700">
                                        <div className="relative">
                                          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                                          <div className="relative bg-background p-4 rounded-full border shadow-sm">
                                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                          </div>
                                        </div>
                                        <div className="text-center space-y-1">
                                          <h3 className="font-medium text-foreground">Connecting to Browser</h3>
                                          <p className="text-sm text-muted-foreground">Establishing secure session...</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-4 opacity-60">
                                        <div className="p-6 bg-muted/50 rounded-full border-2 border-dashed border-muted-foreground/25">
                                          <Monitor className="h-12 w-12" />
                                        </div>
                                        <div className="text-center space-y-1">
                                          <p className="text-lg font-medium text-foreground">Ready to Start</p>
                                          <p className="text-sm">Initialize the task to begin automation</p>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={handleStart} disabled={startJobMutation.isPending}>
                                          <Play className="h-3.5 w-3.5 mr-2" />
                                          Start Session
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}                </div>

                {/* Steps Timeline - Below Browser */}
                {!isBrowserFullscreen && (
                  <div className="border-t bg-background shrink-0">
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                      <h3 className="text-sm font-medium">Steps</h3>
                      {currentStep && (
                        <Badge variant="secondary" className="text-xs">
                          {currentStep.stepNumber ? `Step ${currentStep.stepNumber}` : 'Processing'}
                        </Badge>
                      )}
                    </div>
                    <ScrollArea className="h-32" ref={stepsScrollRef}>
                      <div className="p-3 flex gap-3 min-w-max">
                        {steps.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-4 px-6">
                            {runningJob ? "Waiting for steps..." : "No steps yet. Start the task to see progress."}
                          </div>
                        ) : (
                          steps.map((step, i) => (
                            <div
                              key={`step-${i}`}
                              className="flex-shrink-0 w-64 p-3 rounded-lg border bg-muted/30"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  Step {step.stepNumber || i + 1}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {step.goal || step.message || "Processing..."}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel: Chat */}
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="flex flex-col h-full bg-background">
                {/* Chat Header */}
                <div className="px-4 py-3 flex items-center gap-2 shrink-0">
                  <span className="font-medium">Browser Agent</span>
                  {task.taxReturn && (
                    <span className="text-xs text-muted-foreground ml-auto truncate max-w-[120px]">
                      {task.taxReturn.entityName}
                    </span>
                  )}
                </div>

                {/* Chat Messages */}
                <ScrollArea className="flex-1 min-h-0" ref={chatScrollRef}>
                  <div className="p-4 space-y-6">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Bot className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Start the task to see agent activity</p>
                        {task.taxReturn?.substanceForm && !task.taxReturn.substanceForm.isComplete && (
                          <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg text-yellow-600 text-sm border border-yellow-500/20">
                            <AlertCircle className="h-4 w-4 inline mr-2" />
                            Substance form incomplete
                            <Button variant="link" size="sm" asChild className="text-yellow-600 p-0 h-auto ml-1">
                              <Link href={`/returns/${task.taxReturn.id}`}>
                                Complete form
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                          <div className={`inline-block p-3 rounded-lg text-sm shadow-sm ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-tr-none'
                              : 'bg-muted rounded-tl-none'
                          }`}>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 px-1">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {runningJob && currentStep && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-500/10 text-blue-500 animate-pulse">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="inline-block p-3 rounded-lg rounded-tl-none text-sm bg-muted">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="text-muted-foreground">Thinking...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Chat Input */}
                <div className="p-4 border-t bg-background shrink-0">
                  <div className="relative">
                    <Input
                      placeholder="Message the agent..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      disabled={!runningJob && !pausedJob}
                      className="pr-12"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={handleSendMessage}
                      disabled={(!runningJob && !pausedJob) || !messageInput.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    {runningJob ? "Agent is active and listening" : pausedJob ? "Complete the action in browser, then click Resume" : "Start task to enable chat"}
                  </p>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}