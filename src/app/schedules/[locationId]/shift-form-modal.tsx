'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createShift, updateShift, getSkills } from './actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const shiftFormSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  skillId: z.string().uuid('Please select a skill'),
  headcount: z.number().int().min(1, 'Headcount must be at least 1').max(20, 'Headcount cannot exceed 20'),
});

type ShiftFormData = z.infer<typeof shiftFormSchema>;

interface Skill {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

interface ShiftFormModalProps {
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
  shift?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    skillId: string;
    headcount: number;
    version: number;
  } | null;
}

export function ShiftFormModal({ locationId, isOpen, onClose, shift }: ShiftFormModalProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!shift;

  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: shift
      ? {
          date: shift.date,
          startTime: shift.startTime.slice(0, 5), // Convert HH:MM:SS to HH:MM
          endTime: shift.endTime.slice(0, 5),     // Convert HH:MM:SS to HH:MM
          skillId: shift.skillId,
          headcount: shift.headcount,
        }
      : {
          date: '',
          startTime: '',
          endTime: '',
          skillId: '',
          headcount: 1,
        },
  });

  // Load skills on mount
  useEffect(() => {
    async function loadSkills() {
      const result = await getSkills();
      if (result.success) {
        setSkills(result.skills);
      }
    }
    loadSkills();
  }, []);

  // Reset form when modal opens/closes or shift changes
  useEffect(() => {
    if (isOpen) {
      if (shift) {
        form.reset({
          date: shift.date,
          startTime: shift.startTime.slice(0, 5), // Convert HH:MM:SS to HH:MM
          endTime: shift.endTime.slice(0, 5),     // Convert HH:MM:SS to HH:MM
          skillId: shift.skillId,
          headcount: shift.headcount,
        });
      } else {
        form.reset({
          date: '',
          startTime: '',
          endTime: '',
          skillId: '',
          headcount: 1,
        });
      }
      setError(null);
    }
  }, [isOpen, shift, form]);

  const onSubmit = async (data: ShiftFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('locationId', locationId);
      formData.append('date', data.date);
      formData.append('startTime', data.startTime);
      formData.append('endTime', data.endTime);
      formData.append('skillId', data.skillId);
      formData.append('headcount', data.headcount.toString());

      let result;
      if (isEditMode && shift) {
        formData.append('shiftId', shift.id);
        formData.append('version', shift.version.toString());
        result = await updateShift(formData);
      } else {
        result = await createShift(formData);
      }

      if (result.success) {
        form.reset();
        onClose();
      } else {
        setError(result.error || 'An error occurred');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit Shift' : 'Create Shift'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="skillId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Skill Required</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a skill" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {skills.map((skill) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="headcount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Staff Needed</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Saving...' : isEditMode ? 'Update Shift' : 'Create Shift'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
