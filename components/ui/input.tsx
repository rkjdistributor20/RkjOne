import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
 className,
 type,...props
}: React.ComponentProps<"input">) {
 return (
 <InputPrimitive
 type={type}
 className={cn(
 "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none",
 className)}
 {...props}
 />)
}

export { Input }

