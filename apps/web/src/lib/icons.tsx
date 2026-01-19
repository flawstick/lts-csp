"use client"

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { forwardRef, type SVGProps } from "react"

// Re-export Huge Icons with a wrapper that makes them compatible with our nav components
export function createIcon(iconData: IconSvgElement) {
  const Icon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
      <HugeiconsIcon
        icon={iconData}
        className={className}
        {...(props as any)}
      />
    )
  )
  Icon.displayName = "HugeIcon"
  return Icon
}

// Import all icons we need
import {
  DashboardSquare01Icon,
  File01Icon,
  BotIcon,
  Building02Icon,
  UserGroupIcon,
  CreditCardIcon,
  UserIcon,
  Logout01Icon,
  Moon01Icon,
  Sun01Icon,
  Upload01Icon,
  Delete01Icon,
  CheckmarkBadge01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading01Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ComputerIcon,
  Link01Icon,
  MailSend01Icon,
  Clock01Icon,
  Maximize01Icon,
  Minimize01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  Search01Icon,
  Settings01Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  MoreHorizontalIcon,
  SparklesIcon,
  RocketIcon,
  Shield01Icon,
  ZapIcon,
  Activity01Icon,
  ChartIncreaseIcon,
  RefreshIcon,
  File02Icon,
  CircleIcon,
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  CommandLineIcon,
  PlugSocketIcon,
  PlayCircleIcon,
  Copy01Icon,
  UserAdd01Icon,
  Download01Icon,
  Invoice01Icon,
  AtIcon,
  InformationCircleIcon,
  AlertDiamondIcon,
  LeftToRightListDashIcon,
  Calendar03Icon,
  DragDropIcon,
  Folder01Icon,
  ArrowTurnForwardIcon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons"

// Create wrapped icon components
export const DashboardSquare = createIcon(DashboardSquare01Icon)
export const FileText = createIcon(File01Icon)
export const Bot = createIcon(BotIcon)
export const Building2 = createIcon(Building02Icon)
export const Users = createIcon(UserGroupIcon)
export const CreditCard = createIcon(CreditCardIcon)
export const User = createIcon(UserIcon)
export const LogOut = createIcon(Logout01Icon)
export const Moon = createIcon(Moon01Icon)
export const Sun = createIcon(Sun01Icon)
export const Upload = createIcon(Upload01Icon)
export const Trash2 = createIcon(Delete01Icon)
export const BadgeCheck = createIcon(CheckmarkBadge01Icon)
export const ChevronUp = createIcon(ArrowUp01Icon)
export const ChevronDown = createIcon(ArrowDown01Icon)
export const ChevronLeft = createIcon(ArrowLeft01Icon)
export const ChevronRight = createIcon(ArrowRight01Icon)
export const ChevronsUpDown = createIcon(ArrowUp01Icon) // Use arrow up as fallback
export const ArrowLeft = createIcon(ArrowLeft01Icon)
export const ArrowRight = createIcon(ArrowRight01Icon)
export const Loader2 = createIcon(Loading01Icon)
export const AlertCircle = createIcon(AlertCircleIcon)
export const CheckCircle2 = createIcon(CheckmarkCircle01Icon)
export const Play = createIcon(PlayIcon)
export const Pause = createIcon(PauseIcon)
export const Stop = createIcon(StopIcon)
export const Square = createIcon(StopIcon) // Use stop as fallback for square
export const Monitor = createIcon(ComputerIcon)
export const ExternalLink = createIcon(Link01Icon)
export const Send = createIcon(MailSend01Icon)
export const Mail = createIcon(MailSend01Icon) // Alias for Send
export const Clock = createIcon(Clock01Icon)
export const Maximize2 = createIcon(Maximize01Icon)
export const Minimize2 = createIcon(Minimize01Icon)
export const X = createIcon(Cancel01Icon)
export const XCircle = createIcon(CancelCircleIcon)
export const Search = createIcon(Search01Icon)
export const Settings = createIcon(Settings01Icon)
export const Pencil = createIcon(PencilEdit01Icon)
export const Plus = createIcon(PlusSignIcon)
export const MoreHorizontal = createIcon(MoreHorizontalIcon)
export const Sparkles = createIcon(SparklesIcon)
export const Rocket = createIcon(RocketIcon)
export const Shield = createIcon(Shield01Icon)
export const Zap = createIcon(ZapIcon)
export const Activity = createIcon(Activity01Icon)
export const TrendingUp = createIcon(ChartIncreaseIcon)
export const RotateCcw = createIcon(RefreshIcon)
export const RefreshCw = createIcon(RefreshIcon)
export const File = createIcon(File02Icon)
export const Circle = createIcon(CircleIcon)
export const ChevronLeftDouble = createIcon(ArrowLeftDoubleIcon)
export const ChevronRightDouble = createIcon(ArrowRightDoubleIcon)
export const SquareTerminal = createIcon(CommandLineIcon)
export const Terminal = createIcon(CommandLineIcon)
export const Check = createIcon(CheckmarkCircle01Icon)
export const Ban = createIcon(CancelCircleIcon)
export const History = createIcon(Clock01Icon) // Use clock as history fallback
export const Trash = createIcon(Delete01Icon) // Alias for Trash2
export const Plug = createIcon(PlugSocketIcon)
export const PlayCircle = createIcon(PlayCircleIcon)
export const CheckCircle = createIcon(CheckmarkCircle01Icon) // Alias
export const Copy = createIcon(Copy01Icon)
export const UserPlus = createIcon(UserAdd01Icon)
export const Download = createIcon(Download01Icon)
export const Receipt = createIcon(Invoice01Icon)
export const AtSignIcon = createIcon(AtIcon)
export const ChevronLeftIcon = createIcon(ArrowLeft01Icon) // Alias for back navigation
export const InfoIcon = createIcon(InformationCircleIcon)
export const CircleCheckIcon = createIcon(CheckmarkCircle01Icon)
export const Loader2Icon = createIcon(Loading01Icon)
export const OctagonXIcon = createIcon(CancelCircleIcon) // Use cancel circle as fallback
export const TriangleAlertIcon = createIcon(AlertDiamondIcon)
export const PanelLeftIcon = createIcon(SidebarLeftIcon)
export const CalendarIcon = createIcon(Calendar03Icon)
export const GripVertical = createIcon(DragDropIcon)
export const ChevronDownIcon = createIcon(ArrowDown01Icon)
export const ChevronRightIcon = createIcon(ArrowRight01Icon)
export const ChevronUpIcon = createIcon(ArrowUp01Icon)
export const XIcon = createIcon(Cancel01Icon)
export const CheckIcon = createIcon(CheckmarkCircle01Icon)
export const Folder = createIcon(Folder01Icon)
export const Forward = createIcon(ArrowTurnForwardIcon)
// Note: CircleIcon is exported as Circle above

// Also export the raw HugeiconsIcon for direct usage
export { HugeiconsIcon, Circle as CircleIcon }
