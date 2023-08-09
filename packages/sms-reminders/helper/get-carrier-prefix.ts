const retrievePhoneCarrier = (nationalNumber: string) => {
    let prefix: number;
    prefix = Number(nationalNumber.substring(0, 4));

    return prefix;
}

const isSafaricomNumber = (prefix:number) => {
    if(
        (prefix >= 110 && prefix <= 115) ||
        (prefix >= 701 && prefix <= 729) ||
        (prefix >= 740 && prefix <= 743) ||
        (prefix >= 745 && prefix <= 746) ||
        (prefix == 748) || 
        (prefix >= 757 && prefix <= 759) ||
        (prefix >= 768 && prefix <= 769) ||
        (prefix >= 790 && prefix <= 799)
    )
        return true;
    return false;
}

export { retrievePhoneCarrier, isSafaricomNumber }