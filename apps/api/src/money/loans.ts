import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { MoneyPerson } from '@pa/db';
import { LOAN_DIRECTIONS, type LoanDirection, owedBy } from '@pa/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { amountSchema, daySchema, fieldError, nameSchema, noteSchema } from './common';
import { type EntryJson, EntriesService } from './entries.service';

export interface PersonJson {
  id: string;
  name: string;
  archived: boolean;
  /** What they owe the owner. Negative when the owner owes them. */
  owed: number;
}

const personSchema = z.object({ name: nameSchema });
const personUpdateSchema = z.object({ name: nameSchema.optional(), archived: z.boolean().optional() });
const loanSchema = z.object({
  personId: z.string('Pick a person').min(1, 'Pick a person'),
  direction: z.enum(LOAN_DIRECTIONS, 'Pick what happened'),
  amount: amountSchema,
  accountId: z.string('Pick an account').min(1, 'Pick an account'),
  date: daySchema.optional(),
  note: noteSchema.optional(),
});

/** How a loan entry is named, so the day's list reads naturally. */
function loanName(direction: LoanDirection, person: string): string {
  switch (direction) {
    case 'lent':
      return `Lent to ${person}`;
    case 'borrowed':
      return `Borrowed from ${person}`;
    case 'repaid_to_me':
      return `${person} repaid`;
    case 'repaid_by_me':
      return `Repaid ${person}`;
  }
}

/** People the owner lends to or borrows from, and the money between them. */
@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  private async find(id: string): Promise<MoneyPerson> {
    const person = await this.prisma.moneyPerson.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('That person does not exist');
    return person;
  }

  async listPeople(includeArchived = false): Promise<PersonJson[]> {
    const [people, loans] = await Promise.all([
      this.prisma.moneyPerson.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.entries.ledger({ kind: 'loan' }),
    ]);
    return people.map((person) => ({
      id: person.id,
      name: person.name,
      archived: person.archivedAt !== null,
      owed: owedBy(person.id, loans),
    }));
  }

  private async toJson(person: MoneyPerson): Promise<PersonJson> {
    const loans = await this.entries.ledger({ kind: 'loan', personId: person.id });
    return {
      id: person.id,
      name: person.name,
      archived: person.archivedAt !== null,
      owed: owedBy(person.id, loans),
    };
  }

  async createPerson(name: string): Promise<PersonJson> {
    return this.toJson(await this.prisma.moneyPerson.create({ data: { name } }));
  }

  async updatePerson(id: string, input: z.infer<typeof personUpdateSchema>): Promise<PersonJson> {
    const person = await this.find(id);
    if (input.archived && (await this.toJson(person)).owed !== 0) {
      throw new BadRequestException('Settle up before archiving');
    }
    const updated = await this.prisma.moneyPerson.update({
      where: { id },
      data: {
        name: input.name,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
    });
    return this.toJson(updated);
  }

  async history(id: string): Promise<EntryJson[]> {
    await this.find(id);
    return this.entries.list({ personId: id, limit: 1000 });
  }

  async createLoan(input: z.infer<typeof loanSchema>): Promise<EntryJson> {
    const person = await this.prisma.moneyPerson.findUnique({ where: { id: input.personId } });
    if (!person) throw fieldError('personId', 'Pick a person');
    return this.entries.createLoan({ ...input, name: loanName(input.direction, person.name) });
  }
}

@Controller('money')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get('people')
  people(@Query('includeArchived') includeArchived?: string): Promise<PersonJson[]> {
    return this.loans.listPeople(includeArchived === '1');
  }

  @Post('people')
  createPerson(@Body(new ZodValidationPipe(personSchema)) body: z.infer<typeof personSchema>): Promise<PersonJson> {
    return this.loans.createPerson(body.name);
  }

  @Patch('people/:id')
  updatePerson(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(personUpdateSchema)) body: z.infer<typeof personUpdateSchema>,
  ): Promise<PersonJson> {
    return this.loans.updatePerson(id, body);
  }

  @Get('people/:id/history')
  history(@Param('id') id: string): Promise<EntryJson[]> {
    return this.loans.history(id);
  }

  @Post('loans')
  createLoan(@Body(new ZodValidationPipe(loanSchema)) body: z.infer<typeof loanSchema>): Promise<EntryJson> {
    return this.loans.createLoan(body);
  }
}
