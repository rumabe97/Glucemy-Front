import {Component, OnInit} from '@angular/core';
import {FormArray, FormBuilder, FormControl, FormGroup, Validators} from "@angular/forms";
import {PhasesDayService} from "../../core/services/phases-day/phases-day.service";
import {IFood} from "../../shared/models/food.model";
import {FoodService} from "../../core/services/food/food.service";
import {IRecords} from "../../shared/models/records.model";
import {RecordsService} from "../../core/services/records/records.service";
import {HotToastService} from "@ngneat/hot-toast";
import {ActivatedRoute, Router} from "@angular/router";
import {faTrash} from "@fortawesome/free-solid-svg-icons";
import {DatePipe} from "@angular/common";

@Component({
    selector: 'app-edit-record',
    templateUrl: './edit-record.component.html',
    styleUrls: ['./edit-record.component.scss']
})
export class EditRecordComponent implements OnInit {

    form: FormGroup;
    phasesDay: any[] = [];
    state: any;

    foods: IFood[];
    entryError: boolean = false;
    deleteIcon = faTrash;
    rations: number;

    record: IRecords;
    bolus: FormControl;

    constructor(private _fb: FormBuilder, private _phaseDayService: PhasesDayService,
                private _foodService: FoodService, private _recordService: RecordsService,
                private _toastService: HotToastService, private _router: Router, private _route: ActivatedRoute, private datePipe: DatePipe) {
    }

    ngOnInit() {
        this.record = this._route.snapshot.data['response'];
        this.state = history.state;
        this.createForm();
        this.searchPhase('');
    }

    createForm() {
        this.form = this._fb.group({
            phaseDay: [this.record?.phasesDay?.name ?? '', Validators.required],
            bloodGlucose: [this.record?.blood_glucose ?? '', [Validators.required, Validators.min(0)]],
            annotations: [this.record?.annotations ?? ''],
            bolus: [this.record?.bolus ?? '', [Validators.required, Validators.min(0)]],
            foodEntries: this._fb.array(this.record?.foods.map((f, index) => this.createFoodEntry(f, index, false)) || []),
        });
    }

    createFoodEntry(value?: IFood, index?: number, isNew: boolean = true): FormGroup {
        this.searchFood('');
        const usualMeasure = isNew ? value?.usual_measure : this.record.carbohydrates[index];
        return this._fb.group({
            name: [value?.name ?? '', Validators.required],
            usualMeasure: [usualMeasure, [Validators.required, Validators.min(0)]],
            hcRations: [value?.hc_rations ?? '', [Validators.required, Validators.min(0)]],
            index: [value?.glycemic_index ?? ''],
            id: [value?.id ?? ''],
        });
    }

    get foodEntries() {
        return this.form.get('foodEntries') as FormArray;
    }

    addFoodEntry(value?: IFood,) {
        if (this.foodEntries.invalid) {
            this.foodEntries.markAllAsTouched();
            this.entryError = true;
            return;
        }
        this.foodEntries.push(this.createFoodEntry(value));
    }

    removeFoodEntry(index: number) {
        this.foodEntries.removeAt(index);
    }

    searchPhase(value: any) {
        this._phaseDayService.search({search: value, page: 1}).subscribe(response => {
            this.phasesDay = response.results;
        });
    }

    searchFood(value: any) {
        const name = value ? value.controls.name.value : '';
        this._foodService.search({search: name, page: 1}).subscribe(response => {
            this.foods = response.results;
        });
    }


    getRecommendedRations(): number {
        return this.foodEntries.controls.reduce((sum, entry) => {
            const rations = entry.get('usualMeasure')?.value / entry.get('hcRations')?.value;
            this.rations = sum + (isNaN(rations) ? 0 : rations);
            return sum + (isNaN(rations) ? 0 : rations);
        }, 0);
    }

    setOption(entry: any) {
        this.entryError = false;
        const food = this.foods.find(f => f.name === entry.controls.name.value);
        entry.get('usualMeasure').setValue(food?.usual_measure ?? '');
        entry.get('index').setValue(food?.glycemic_index ?? '');
        entry.get('hcRations').setValue(food?.hc_rations ?? '');
        entry.get('id').setValue(food?.id ?? '');
    }

    getBackground(value: number) {
        if (!value && value !== 0) return '';
        if (value < 60) return 'glycemicIndexLow';
        if (value >= 60 && value < 70) return 'glycemicIndexMedium';
        return 'glycemicIndexHard';
    }

    save() {
        if (this.form.valid && this.foodEntries.valid && this.foodEntries.length > 0) {
            const sortedControls = this.foodEntries.controls.sort((a, b) => {
                const idA = a.get('id')?.value || 0;
                const idB = b.get('id')?.value || 0;
                return idB - idA;
            });
            const carbohydrates = sortedControls.map(v => v.get('usualMeasure')?.value);
            const phaseDay = this.phasesDay.find(p => p.name === this.form.get('phaseDay').value);

            const record: IRecords = {
                idPhaseDay: phaseDay.id,
                carbohydrates,
                hc_rations: this.rations,
                bolus: this.form.get('bolus').value,
                idFoods: this.foodEntries.controls.map(e => e.get('id').value),
                id: this.record?.id ?? '',
                blood_glucose: this.form.get('bloodGlucose').value,
                ...this.form.value
            }
            if (this.state?.date && !record.id) record.created_date = this.formatDateWithPhase(this.state.date, phaseDay.name);
            const $action = this.record ? this._recordService.update(record) : this._recordService.create(record);
            $action.subscribe(() => {
                this._toastService.success(`Record ${this.record ? 'updated' : 'created'} successfully`);
                this._router.navigate(['../'], {relativeTo: this._route}).then();
            });
        }
    }

    formatDateWithPhase(date: string, phase: string): string {
        const phaseTimes: { [key: string]: { hours: number; minutes: number } } = {
            'Breakfast': {hours: 8, minutes: 0},
            'Mid-Morning Snack': {hours: 11, minutes: 0},
            'Lunch': {hours: 14, minutes: 0},
            'Afternoon Snack': {hours: 17, minutes: 30},
            'Dinner': {hours: 21, minutes: 0},
            'Late-Night Snack': {hours: 23, minutes: 0},
        };

        const selectedTime = phaseTimes[phase];
        if (!selectedTime) {
            return '';
        }

        const parsedDate = new Date(date);
        parsedDate.setHours(selectedTime.hours, selectedTime.minutes, 0, 0);
        return this.datePipe.transform(parsedDate, 'yyyy-MM-ddTHH:mm:ss.SSSZ') || '';
    }
}
