import { Component, OnInit, ViewChild, ElementRef, OnDestroy, HostListener, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { ExplorerService } from '../../shared/services/explorer.service';
import { CurrencyService } from '../../shared/services/currency.service';
import { ConnectionMessageService } from '../../shared/services/connection-message.service';
import { initCurrency } from '../../shared/const/currency';
import { PaginatedTransactions, Transaction } from '../../models/transaction.model';
import {Account} from '../../models/account.model';
import { Subscription } from 'rxjs/Subscription';

import 'rxjs/add/operator/switchMap';
import { Observable } from 'rxjs/Rx';
import { PaginationResult } from '../../models/pagination.model';

@Component({
  selector: 'ark-address',
  templateUrl: './address.component.html',
  styleUrls: ['./address.component.less'],
  providers: [ExplorerService]
})
export class AddressComponent implements OnInit, OnDestroy {
  @ViewChild('voters') votersBlock: ElementRef;
  @ViewChild('balance') balanceContainer: ElementRef;
  @ViewChild('transactions') transactionsElement: ElementRef;

  public addressItem: Account;
  public currentTransactions: Transaction[];
  public activeTab: string;
  public currencyName: string = initCurrency.name;
  public currencyValue: number = initCurrency.value;
  public showLoader = false;
  public showBalanceFooter = false;
  public openVoters = false;
  public supply = 0;
  public voters: Account[];
  public areVotersExpanded = false;
  public currentTransactionsFunc: (offset: number) => Observable<PaginatedTransactions>;
  public renderPagination: boolean;

  private _currentAddress = '';
  private subscription: Subscription;
  private supplySubscription: Subscription;
  private votersNumber = 4;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private route: ActivatedRoute,
    private router: Router,
    private _explorerService: ExplorerService,
    private _currencyService: CurrencyService,
    private _connectionService: ConnectionMessageService
  ) {
    this.subscription = _currencyService.currencyChosen$.subscribe(currency => {
      this.currencyName = currency.name;
      this.currencyValue = currency.value;
    });
    this.supplySubscription = _currencyService.supplyChosen$.subscribe(supply => {
      this.supply = supply;
    });
  }

  ngOnInit() {
    this.onResize();
    this.showLoader = true;
    this.route.params.subscribe((params: Params) => {
      this.setTransactionParameters(params['type']);

      // if we have a page we scroll to the transactions section
      if (params['page']) {
        window.scrollTo(0, this.transactionsElement.nativeElement.offsetTop - 125);
      }

      if (params['id'] === this._currentAddress) {
        return;
      }

      this._currentAddress = params['id'];

      this._explorerService.getAccount(this._currentAddress).subscribe(
        res => {
          this.addressItem = res.account;
          this._connectionService.changeConnection(res.success);
          window.scrollTo(0, 0);

          this._explorerService.getDelegateByPublicKey(this.addressItem.publicKey).subscribe(
            res => {
              if (res) {
                this.addressItem.delegate = res;

                this._explorerService.getForgedByPublicKey(this.addressItem.publicKey).subscribe(
                  res => {
                    this.addressItem.delegate.forged = res;
                  }
                );

                this._explorerService.getDelegateVoters(this.addressItem.publicKey).subscribe(
                  res => {
                    this.addressItem.voters = res
                    this.voters = this.addressItem.voters.sort((one, two) => two.balance - one.balance);
                  }
                );
              }
            }
          );

          this._explorerService.getDelegateVotes(this._currentAddress).subscribe(
            res => {
              this.addressItem.votes = res;
            }
          );

          this._explorerService.getSendByAddressCount(this._currentAddress).subscribe(
            res => {
              this.addressItem.outgoing_cnt = res;
            }
          );

          this._explorerService.getReceivedByAddressCount(this._currentAddress).subscribe(
            res => {
              this.addressItem.incoming_cnt = res;
            }
          );
        }
      );
    });
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.balanceContainer) {
      return;
    }
    const position = this.balanceContainer.nativeElement.getBoundingClientRect().bottom || 0;
    if (position < 85) {
      this.showBalanceFooter = true;
      this.document.body.classList.add('extra-footer');
    } else {
      this.showBalanceFooter = false;
      this.document.body.classList.remove('extra-footer');
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    const width = window.innerWidth;
    if (width > 940) {
      this.votersNumber = 3;
    } else if (width > 700) {
      this.votersNumber = 2;
    } else {
      this.votersNumber = 1;
    }
  }

  private setTransactionParameters(type?: string): void {
    if (this.activeTab != null && this.activeTab === type) {
      return;
    }

    if (type === 'sent') {
      this.currentTransactionsFunc = this.getSentTransactions;
    } else if (type === 'received') {
      this.currentTransactionsFunc = this.getReceivedTransactions;
    } else {
      type = 'all';
      this.currentTransactionsFunc = this.getAllTransactions;
    }

    this.activeTab = type;
    this.renderPagination = false;
    window.setTimeout(() => this.renderPagination = true);
  }

  private getAllTransactions = (offset: number): Observable<PaginatedTransactions> => {
   return this._explorerService.getTransactionsByAddress(this._currentAddress, offset);
  }

  private getSentTransactions = (offset: number): Observable<PaginatedTransactions> => {
    return this._explorerService.getSendTransactionsByAddress(this._currentAddress, offset);
  }

  private getReceivedTransactions = (offset: number): Observable<PaginatedTransactions> => {
    return this._explorerService.getReceivedTransactionsByAddress(this._currentAddress, offset);
  }

  showBlock() {
    // this.votersBlock.nativeElement.classList.toggle('open');
    this.openVoters = !this.openVoters;
  }

  getAddressLink(id: string) {
    return ['/address', id];
  }

  getVoters() {
    return this.areVotersExpanded ? this.voters : this.voters.slice(0, this.votersNumber);
  }

  public onChangePage = (): void => {
    this.currentTransactions = [];
    this.showLoader = true;
  }

  public onPageResult = (pageResult: PaginatedTransactions): void => {
    this.currentTransactions = pageResult.transactions;
    this.showLoader = false;
  }

  public getTransactionTypeLink(activeTab: string): any[] {
    return this.getPageLink(1, activeTab);
  }

  public getPageLink = (page: number, activeTab?: string): any[] => {
    return ['/address', this._currentAddress, 'transactions', activeTab || this.activeTab, page];
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.supplySubscription.unsubscribe();
    this.document.body.classList.remove('extra-footer');
  }

}
